// Hash <-> state. Reads the URL once at start (and on hashchange), writes throttled with replaceState.
import { effect, batch } from '@preact/signals';
import { throttle } from '../core/scheduler';
import { followCurrent, followWanted } from '../ext/channels';
import { parseHash, serializeHash, type UrlState } from '../core/url';
import { editKarte, getKarte, isBuiltin, karten, setBasemap } from '../karten/store';
import { resolveBasemapId } from '../map/basemaps';
import { hasLayer } from '../layers/registry';
import { activeKarte, setActiveKarte } from './session';
import { detailOpen } from './hud';
import { place, selectPlace } from './selection';
import { isMobile } from './ui';
import { live, setTime, time } from './time';
import { camera, projection, setCamera, setProjection } from './view';

/**
 * The Karte a link with layers but no `k=` means: the standard Karte that holds the most of those layers (the active one
 * first on a tie). Undefined when none of them is in any standard Karte, then the link opens nothing.
 */
function karteForLayers(layers: string[]): string | undefined {
  const wanted = layers.filter(hasLayer);
  if (!wanted.length) return undefined;
  const activeId = activeKarte.peek().id;
  let best: { id: string; n: number } | undefined;
  for (const k of [...karten.peek()].sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId))) {
    if (!isBuiltin(k.id)) continue;
    const have = new Set(k.layers.map((l) => l.id));
    const n = wanted.filter((id) => have.has(id)).length;
    if (n > (best?.n ?? 0)) best = { id: k.id, n };
  }
  return best?.id;
}

export function applyUrlState(u: UrlState): void {
  // layers without a Karte: look for the standard Karte they belong to
  const fromLayers = !u.karte && u.layers?.length ? karteForLayers(u.layers) : undefined;
  const karteId = u.karte ?? fromLayers;
  if (u.layers?.length && !karteId) u = { ...u, layers: undefined, basemap: undefined };
  batch(() => {
    if (karteId) (setActiveKarte(karteId), u.place || (detailOpen.value = true));
    if (u.view) setCamera({ lng: u.view.lng, lat: u.view.lat, zoom: u.view.zoom, bearing: u.view.bearing ?? 0, pitch: u.view.pitch ?? 0 });
    if (u.globe !== undefined) setProjection(u.globe ? 'globe' : 'mercator');
    if (u.layers) {
      const k = getKarte(karteId ?? activeKarte.peek().id);
      if (k) {
        const want = new Set(u.layers.filter(hasLayer));
        const have = new Set(k.layers.filter((l) => l.visible).map((l) => l.id));
        if (want.size !== have.size || [...want].some((id) => !have.has(id))) {
          editKarte(k.id, (kk) => {
            const known = new Set(kk.layers.map((l) => l.id));
            const extra = [...want].filter((id) => !known.has(id)).map((id) => ({ id, visible: true, opacity: 1 }));
            return { ...kk, layers: [...extra, ...kk.layers.map((l) => ({ ...l, visible: want.has(l.id) }))] };
          });
        }
      }
    }
    const wanted = resolveBasemapId(u.basemap);
    if (wanted) {
      const k = getKarte(karteId ?? activeKarte.peek().id);
      if (k && k.basemap !== wanted) setBasemap(k.id, wanted);
    }
    if (u.time !== undefined) setTime(u.time);
    // a new object each time: the same object asked for again starts the follow again
    followWanted.value = u.follow ? { ...u.follow } : null;
    if (u.place && !isMobile.peek()) {
      const cur = place.peek();
      if (!cur || cur.title !== u.place.title || cur.lat !== u.place.lat || cur.lng !== u.place.lng) selectPlace({ id: `url:${u.place.title}`, title: u.place.title, subtitle: u.place.subtitle, lng: u.place.lng, lat: u.place.lat, kind: u.place.kind });
    }
  });
}

export function currentUrlState(): UrlState {
  const c = camera.value;
  const k = activeKarte.value;
  const layers = k.layers.filter((l) => l.visible).map((l) => l.id);
  // Detail menu closed and nothing shown: the Karte is not part of what the link shows, so leave k and l out
  const bare = !detailOpen.value && !layers.length;
  return {
    view: { lat: c.lat, lng: c.lng, zoom: c.zoom, bearing: c.bearing, pitch: c.pitch },
    karte: bare ? undefined : k.id,
    layers: bare ? undefined : layers,
    basemap: k.basemap,
    time: live.value ? undefined : time.value,
    globe: projection.value === 'globe',
    follow: followCurrent.value ?? undefined,
    place: place.value ? { lat: place.value.lat, lng: place.value.lng, title: place.value.title, subtitle: place.value.subtitle, kind: place.value.kind } : undefined,
  };
}

/** Applies the current hash and keeps it in sync. Returns a dispose function. */
export function startUrlSync(): () => void {
  if (typeof window === 'undefined') return () => {};
  applyUrlState(parseHash(window.location.hash));
  const write = throttle((hash: string) => {
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }, 500);
  const stop = effect(() => write(serializeHash(currentUrlState())));
  const onHash = () => {
    const fresh = serializeHash(currentUrlState());
    if (window.location.hash !== fresh) applyUrlState(parseHash(window.location.hash));
  };
  window.addEventListener('hashchange', onHash);
  return () => {
    stop();
    write.cancel();
    window.removeEventListener('hashchange', onHash);
  };
}
