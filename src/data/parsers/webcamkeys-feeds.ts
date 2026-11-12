// Table and loader of the keyed live camera feeds (browser requests with the user's own key; the key never goes into
// resource keys, logs or error texts). Used by layers/medien/webcams.
import { signal, type ReadonlySignal } from '@preact/signals';
import { proxied } from '../endpoints';
import { applyCamdir } from './webcamkeys';
import { ibiCameras, npsCameras, ohgoCameras, qldCameras, trafikverketCameras, windyCameras } from './webcamkeys';
import type { WebcamCollection } from './webcams';

export interface KeyedFeed {
  id: string;
  /** key id of `src/keys/defs` */
  key: string;
  label: string;
  /** west, south, east, north; undefined = follows the viewport (Windy) */
  bbox?: [number, number, number, number];
  source: { name: string; url: string; license: string };
  request(key: string, view: { lng: number; lat: number; radiusKm: number }): { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } };
  parse(raw: unknown): WebcamCollection;
}

const ibi = (id: string, key: string, host: string, label: string, name: string, source: string, bbox: [number, number, number, number]): KeyedFeed => ({
  id, key, label, bbox,
  source: { name: `${label}, 511-Portal (Schlüssel)`, url: `https://${host}`, license: 'Nutzungsbedingungen des Portals, eigener Schlüssel' },
  request: (k) => ({ url: `https://${host}/api/v2/get/cameras?format=json&key=${encodeURIComponent(k)}` }),
  parse: (raw) => ibiCameras(raw, { id, name, source }),
});

export const KEYED_FEEDS: KeyedFeed[] = [
  ibi('ut', 'utah511', 'prod-ut.ibi511.com', 'UDOT Traffic (Utah)', 'UDOT', 'Utah DOT (UDOT Traffic)', [-114.1, 36.9, -109.0, 42.1]),
  ibi('az', 'arizona511', 'az511.com', 'AZ511 (Arizona)', 'AZ511', 'Arizona DOT (AZ511)', [-114.9, 31.3, -109.0, 37.1]),
  ibi('id', 'idaho511', '511.idaho.gov', 'Idaho 511', 'Idaho 511', 'Idaho Transportation Department (Idaho 511)', [-117.3, 41.9, -111.0, 49.1]),
  ibi('nv', 'nevada511', 'nvroads.com', 'NVRoads (Nevada)', 'NVRoads', 'Nevada DOT (NVRoads)', [-120.1, 35.0, -114.0, 42.1]),
  ibi('ak', 'alaska511', '511.alaska.gov', 'Alaska 511', 'Alaska 511', 'Alaska DOT&PF (Alaska 511)', [-170.0, 51.0, -129.9, 71.5]),
  ibi('ga511', 'georgia511', '511ga.org', 'Georgia 511', 'Georgia 511', 'Georgia DOT (Georgia 511)', [-85.7, 30.3, -80.7, 35.1]),
  ibi('la', 'louisiana511', '511la.org', 'Louisiana 511', 'Louisiana 511', 'Louisiana DOTD (511 Louisiana)', [-94.1, 28.8, -88.7, 33.1]),
  ibi('pa', 'pennsylvania511', '511pa.com', '511PA (Pennsylvania)', '511PA', 'PennDOT (511PA)', [-80.6, 39.7, -74.6, 42.3]),
  {
    id: 'ohgo', key: 'ohgo', label: 'OHGO (Ohio)', bbox: [-84.9, 38.4, -80.5, 42.4],
    source: { name: 'Ohio DOT, OHGO Public API (Schlüssel)', url: 'https://publicapi.ohgo.com/', license: 'Nutzungsbedingungen OHGO, eigener Schlüssel' },
    request: (k) => ({ url: `https://publicapi.ohgo.com/api/v1/cameras?page-all=true&api-key=${encodeURIComponent(k)}` }), parse: ohgoCameras,
  },
  {
    id: 'qld', key: 'qldtraffic', label: 'QLDTraffic (Queensland)', bbox: [138.0, -29.2, 153.6, -10.0],
    source: { name: 'Queensland Department of Transport and Main Roads, QLDTraffic (Schlüssel)', url: 'https://qldtraffic.qld.gov.au/more/Developers-and-Data/', license: 'CC BY 4.0, eigener Schlüssel' },
    request: (k) => ({ url: `https://api.qldtraffic.qld.gov.au/v1/webcams?apikey=${encodeURIComponent(k)}` }), parse: qldCameras,
  },
  {
    id: 'trafikverket', key: 'trafikverket', label: 'Trafikverket (Schweden)', bbox: [10.9, 55.3, 24.2, 69.1],
    source: { name: 'Trafikverket Open API (Schlüssel)', url: 'https://api.trafikinfo.trafikverket.se/', license: 'CC0, eigener Schlüssel' },
    request: (k) => ({
      url: 'https://api.trafikinfo.trafikverket.se/v2/data.json',
      init: { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: `<REQUEST><LOGIN authenticationkey="${k.replace(/[^\w-]/g, '')}"/><QUERY objecttype="Camera" schemaversion="1.1" limit="5000"><FILTER><EQ name="Active" value="true"/></FILTER><INCLUDE>Id</INCLUDE><INCLUDE>Name</INCLUDE><INCLUDE>Direction</INCLUDE><INCLUDE>Geometry</INCLUDE><INCLUDE>PhotoUrl</INCLUDE><INCLUDE>Location</INCLUDE><INCLUDE>Type</INCLUDE></QUERY></REQUEST>` },
    }),
    parse: trafikverketCameras,
  },
  {
    id: 'nps', key: 'nps', label: 'US-Nationalparks (NPS)', bbox: [-170, 18, -64, 72],
    source: { name: 'US National Park Service, Developer API (Schlüssel, Abruf über den Daten-Proxy)', url: 'https://www.nps.gov/subjects/developer/', license: 'Public Domain, eigener Schlüssel' },
    request: (k) => ({ url: proxied(`https://developer.nps.gov/api/v1/webcams?limit=600&api_key=${encodeURIComponent(k)}`) }), parse: npsCameras,
  },
  {
    id: 'windy', key: 'windy', label: 'Windy Webcams (weltweit, Kartenausschnitt)',
    source: { name: 'Windy.com Webcams API v3 (Schlüssel)', url: 'https://api.windy.com/webcams', license: 'Windy-Nutzungsbedingungen, eigener Schlüssel; Bild-URLs laufen nach ca. 10 Minuten ab' },
    request: (k, v) => ({
      url: `https://api.windy.com/webcams/api/v3/webcams?nearby=${v.lat.toFixed(3)},${v.lng.toFixed(3)},${Math.max(5, Math.min(250, Math.round(v.radiusKm)))}&limit=50&include=images,location,urls&lang=de`,
      init: { headers: { 'x-windy-api-key': k } },
    }),
    parse: windyCameras,
  },
];

export interface KeyedState { data: ReadonlySignal<WebcamCollection | undefined>; errors: ReadonlySignal<Record<string, string>>; loading: ReadonlySignal<boolean>; refresh(view: { west: number; south: number; east: number; north: number; zoom: number }): void; destroy(): void }

const overlaps = (b: [number, number, number, number], v: { west: number; south: number; east: number; north: number }) => b[2] >= v.west && b[0] <= v.east && b[3] >= v.south && b[1] <= v.north;

/**
 * Loads every keyed feed whose key is set and whose area is in view (Windy: around the viewport centre from zoom 6).
 * Results are kept per feed; a changed key reloads that feed. Errors are reported per feed id, without the key.
 */
export function createKeyedFeeds(keyOf: (id: string) => string | undefined, camdir: () => Record<string, number> | undefined): KeyedState {
  const results = signal<Record<string, WebcamCollection>>({});
  const errors = signal<Record<string, string>>({});
  const loading = signal(false);
  const data = signal<WebcamCollection | undefined>(undefined);
  const loaded = new Map<string, string>(); // feed id -> request signature
  const inflight = new Map<string, AbortController>();
  let destroyed = false;
  const publish = () => { data.value = { type: 'FeatureCollection', features: Object.values(results.value).flatMap((c) => applyCamdir(c, camdir()).features) }; };
  const setError = (id: string, msg?: string) => { const e = { ...errors.value }; if (msg) e[id] = msg; else delete e[id]; errors.value = e; };

  async function load(f: KeyedFeed, key: string, view: { lng: number; lat: number; radiusKm: number }, sig: string) {
    inflight.get(f.id)?.abort();
    const ctl = new AbortController();
    inflight.set(f.id, ctl);
    loading.value = true;
    try {
      const req = f.request(key, view);
      const timer = setTimeout(() => ctl.abort(), 40_000);
      let json: unknown;
      try {
        const res = await fetch(req.url, { ...req.init, signal: ctl.signal });
        if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Schlüssel abgelehnt' : `Quelle meldet Fehler ${res.status}`);
        json = await res.json();
      } finally { clearTimeout(timer); }
      const res = { data: json };
      if (destroyed || ctl.signal.aborted) return;
      results.value = { ...results.value, [f.id]: f.parse(res.data) };
      setError(f.id);
      publish();
    } catch (e) {
      if (ctl.signal.aborted) return;
      loaded.delete(f.id);
      // 401/403 usually mean a wrong key; the browser hides the status of CORS-less error answers, so say so generally
      setError(f.id, e instanceof TypeError ? 'Quelle nicht erreichbar (oder Schlüssel abgelehnt)' : (e as Error).message.replaceAll(key, '…'));
    } finally {
      if (!ctl.signal.aborted) loading.value = false;
    }
    void sig;
  }

  return {
    data, errors, loading,
    refresh(v) {
      if (destroyed) return;
      const lng = (v.west + v.east) / 2, lat = (v.south + v.north) / 2;
      const radiusKm = Math.hypot((v.east - v.west) * 111 * Math.cos((lat * Math.PI) / 180), (v.north - v.south) * 111) / 2;
      for (const f of KEYED_FEEDS) {
        const key = keyOf(f.key)?.trim();
        if (!key) { if (results.value[f.id]) { const r = { ...results.value }; delete r[f.id]; results.value = r; publish(); } loaded.delete(f.id); continue; }
        if (f.bbox ? !overlaps(f.bbox, v) : v.zoom < 6) continue;
        const sig = f.bbox ? key : `${key}|${lat.toFixed(1)},${lng.toFixed(1)},${Math.round(radiusKm / 20)}`;
        if (loaded.get(f.id) === sig) continue;
        loaded.set(f.id, sig);
        void load(f, key, { lng, lat, radiusKm }, sig);
      }
    },
    destroy() { destroyed = true; for (const c of inflight.values()) c.abort(); },
  };
}
