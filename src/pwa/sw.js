/* Orbis Wetter und Orbis Bahn – Service Worker (eine Vorlage; vite.pwa.ts setzt beim Build je App `const CONFIG = {...}` davor
 * und registriert wird er nur auf der eigenen Origin der App).
 *
 * Er macht die App ohne Netz startbar: Die App-Shell (HTML, JS, CSS, Icons) wird beim Install vorgehalten. Kacheln, Schriften
 * und Wetterfelder bleiben, wie sie zuletzt geladen wurden, auch über Updates hinweg. Live-Daten (Vorhersage, Warnungen,
 * Abfahrten, Verbindungen) fasst er nicht an: Die speichert die App selbst und zeigt, wie alt sie sind. Aus diesem Cache
 * gäben sie sich als aktuell aus. */

const { app, version, required, optional } = CONFIG;
const PREFIX = `orbis-${app}-`;
const SHELL = `${PREFIX}shell-${version}`;
const RUNTIME = `${PREFIX}runtime`;
const FIELDS = `${PREFIX}fields`;
const MAX_ENTRIES = { [RUNTIME]: 500, [FIELDS]: 16 };
const MAX_BYTES = { [RUNTIME]: 3_000_000, [FIELDS]: 6_000_000 };
/** Danach startet die App aus dem Cache, wenn die Seite nicht antwortet. */
const PAGE_TIMEOUT_MS = 4000;
const LIVE = [
  /^https:\/\/api\.open-meteo\.com\//,
  /^https:\/\/air-quality-api\.open-meteo\.com\//,
  /^https:\/\/maps\.dwd\.de\/.*typeName=dwd(:|%3A)Warnungen/i,
  /^https:\/\/api\.transitous\.org\//,
];

/** Eine umgeleitete Antwort darf keine Seitennavigation beantworten: ohne den Vermerk speichern. */
const plain = (response) => (response.redirected ? new Response(response.body, { status: response.status, headers: response.headers }) : response);

async function precache(cache, url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  await cache.put(url, plain(response));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Fehlt eine Datei der App, scheitert die Installation: Die alte Version bleibt, der nächste Besuch versucht es neu.
      await Promise.all(required.map((url) => precache(cache, url)));
      await Promise.allSettled(optional.map((url) => precache(cache, url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, RUNTIME, FIELDS]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && !keep.has(key)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

const writes = {};

async function put(name, request, response) {
  const length = Number(response.headers.get('content-length'));
  if (name !== SHELL && length > MAX_BYTES[name]) return;
  const cache = await caches.open(name);
  await cache.put(request, response);
  const limit = MAX_ENTRIES[name];
  // Cache.keys() ist teuer – bei den vielen Kacheln nur gelegentlich prüfen.
  writes[name] = (writes[name] ?? 0) + 1;
  if (!limit || (name === RUNTIME && writes[name] % 20 !== 0)) return;
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((old) => cache.delete(old)));
}

/** Speichert nebenbei: Die Antwort wartet nicht darauf, ein voller Speicher bricht sie nicht ab. */
function keep(event, name, response) {
  if (response.status === 200) event.waitUntil(put(name, event.request, response.clone()).catch(() => {}));
  return response;
}

/** Vite liefert "Vary: Origin" – Modul-Scripts haben einen Origin-Header, der Precache-Abruf nicht. */
const lookup = async (name, request) => (await caches.open(name)).match(request, { ignoreVary: true });

async function cacheFirst(event, name) {
  return (await lookup(name, event.request)) ?? keep(event, name, await fetch(event.request));
}

async function networkFirst(event) {
  try {
    const response = await fetch(event.request);
    if (response.ok || response.type === 'opaque') return keep(event, RUNTIME, response);
    // Auch Proxy-Fehler (502/503) dürfen auf den Cache fallen.
    return (await lookup(RUNTIME, event.request)) ?? response;
  } catch {
    return (await lookup(RUNTIME, event.request)) ?? Response.error();
  }
}

/** Die Seite: aus dem Netz, ohne Antwort die vorgehaltene. Gespeichert wird sie nur beim Install, passend zu den Dateien. */
async function page(request) {
  const cached = await lookup(SHELL, '/');
  const abort = new AbortController();
  const timer = cached && setTimeout(() => abort.abort(), PAGE_TIMEOUT_MS);
  try {
    const response = await fetch(request, { signal: abort.signal });
    return response.status >= 500 && cached ? cached : response;
  } catch {
    return cached ?? Response.error();
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  const own = url.origin === self.location.origin;
  if (request.mode === 'navigate') {
    if (own) event.respondWith(page(request));
  } else if (own) {
    event.respondWith(cacheFirst(event, SHELL));
  } else if (url.pathname.endsWith('.owx')) {
    // Die Pfade der Wetterfelder enthalten den Modelllauf: Ihr Inhalt ändert sich nie.
    event.respondWith(cacheFirst(event, FIELDS));
  } else if (!LIVE.some((pattern) => pattern.test(request.url))) {
    event.respondWith(networkFirst(event));
  }
});
