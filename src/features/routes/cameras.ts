// Speed cameras along the route shown in the planner: fixed ones from the OpenStreetMap set of the Blitzer layer
// (blitzer.pmtiles, read directly at one zoom level) and reported mobile checks (Blitzer.de, same source as the layer).
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { PMTiles } from 'pmtiles';
import { batch, effect, signal } from '@preact/signals';
import type { FeatureCollection } from 'geojson';
import { osmPmtilesUrl } from '../../data/osmfiles';
import { proxied } from '../../data/endpoints';
import { fetchRaw } from '../../data/http';
import { blitzerdeMarkers, blitzerdeUrl } from '../../data/parsers/blitzerde';
import { orteView } from '../../state/hud';
import { routeChoice, routeState } from '../../state/routes';

export interface RouteCamera { id: string; lng: number; lat: number; kind: 'fixed' | 'mobile'; title: string; speed?: number }
export type RouteCameras = { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ok'; cameras: RouteCamera[]; mobileFailed: boolean };

/** A camera counts as "on the route" up to this distance from the line, in metres. */
export const NEAR_M = 30;
const ZOOM = 12;
const MAX_TILES = 120;
const GRID = 0.15; // degrees, as in the Blitzer layer, so overlapping requests share the proxy cache
const MAX_GRID = 24;
const KIND: Record<string, string> = { cam: 'Ortsfester Blitzer', section: 'Abschnittskontrolle', signals: 'Rotlicht-Blitzer' };

type P = [number, number];
const M = 111_320;

/** Distance in metres of a point to a line (local flat approximation, fine for a few hundred metres). */
export function distanceToLine(p: P, line: readonly P[]): number {
  const k = Math.cos((p[1] * Math.PI) / 180);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1]![0] - p[0]) * k * M, ay = (line[i - 1]![1] - p[1]) * M;
    const bx = (line[i]![0] - p[0]) * k * M, by = (line[i]![1] - p[1]) * M;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

const tileOf = (lng: number, lat: number, z: number): [number, number] => {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
};

/** Points along a line at most `step` degrees apart (the vertices included). */
function* samples(line: readonly P[], step: number): Generator<P> {
  for (let i = 0; i < line.length; i++) {
    const a = line[i]!;
    yield a;
    const b = line[i + 1];
    if (!b) return;
    const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / step);
    for (let s = 1; s < n; s++) yield [a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n];
  }
}

/** The tiles a line passes through (also the neighbours of points close to a tile edge), as [x, y]. */
export function tilesAlong(line: readonly P[], z = ZOOM): [number, number][] {
  const seen = new Map<string, [number, number]>();
  const d = (NEAR_M * 2) / M; // degrees, generous
  const step = 360 / 2 ** z / 4; // a quarter of a tile
  for (const [lng, lat] of samples(line, step)) {
    for (const [dx, dy] of [[0, 0], [d, d], [-d, d], [d, -d], [-d, -d]] as const) {
      const [x, y] = tileOf(lng + dx, lat + dy, z);
      seen.set(`${x}/${y}`, [x, y]);
    }
  }
  return [...seen.values()];
}

/** One camera per spot: OpenStreetMap lists a camera once per direction, a few metres apart, which would draw on top of each other. */
export function mergeNear(cams: readonly RouteCamera[], within = 30): RouteCamera[] {
  const kept: RouteCamera[] = [];
  for (const c of cams) {
    const k = Math.cos((c.lat * Math.PI) / 180);
    const same = kept.find((o) => o.kind === c.kind && Math.hypot((o.lng - c.lng) * k, o.lat - c.lat) * M <= within);
    if (!same) kept.push(c);
    else if (same.speed === undefined && c.speed !== undefined) same.speed = c.speed;
  }
  return kept;
}

let archive: { url: string; pm: PMTiles } | undefined;
async function fixedCameras(line: P[], signal: AbortSignal): Promise<RouteCamera[]> {
  const url = await osmPmtilesUrl('blitzer');
  if (archive?.url !== url) archive = { url, pm: new PMTiles(url) };
  const { pm } = archive;
  const z = Math.min(ZOOM, (await pm.getHeader()).maxZoom);
  const tiles = tilesAlong(line, z);
  if (tiles.length > MAX_TILES) throw new Error('Route zu lang');
  const found = new Map<string, RouteCamera>();
  await Promise.all(tiles.map(async ([x, y]) => {
    const t = await pm.getZxy(z, x, y, signal);
    if (!t) return;
    const layer = new VectorTile(new PbfReader(new Uint8Array(t.data))).layers.blitzer;
    for (let i = 0; layer && i < layer.length; i++) {
      const f = layer.feature(i);
      const g = f.toGeoJSON(x, y, z).geometry;
      if (g.type !== 'Point') continue;
      const c = g.coordinates as P;
      if (distanceToLine(c, line) > NEAR_M) continue;
      const p = f.properties as { id?: number; kind?: string; speed?: string };
      const id = `o${p.id ?? c.join(',')}`;
      const speed = p.speed && /^\d+$/.test(p.speed) ? Number(p.speed) : undefined;
      found.set(id, { id, lng: c[0], lat: c[1], kind: 'fixed', title: KIND[p.kind ?? 'cam'] ?? KIND.cam!, ...(speed ? { speed } : {}) });
    }
  }));
  return [...found.values()];
}

async function mobileCameras(line: P[], signal: AbortSignal): Promise<RouteCamera[]> {
  const cells = new Map<string, [number, number]>();
  for (const [lng, lat] of samples(line, GRID / 2)) cells.set(`${Math.floor(lng / GRID)},${Math.floor(lat / GRID)}`, [Math.floor(lng / GRID), Math.floor(lat / GRID)]);
  if (cells.size > MAX_GRID) throw new Error('Route zu lang');
  const out = new Map<string, RouteCamera>();
  const results = await Promise.allSettled([...cells.values()].map(async ([x, y]) => {
    const r = await fetchRaw<unknown>(proxied(blitzerdeUrl(y * GRID, x * GRID, (y + 1) * GRID, (x + 1) * GRID)), { signal, timeout: 15_000 });
    for (const f of blitzerdeMarkers(r.data).features) {
      const c = f.geometry.coordinates as P;
      if (distanceToLine(c, line) > NEAR_M) continue;
      out.set(f.properties.id, { id: f.properties.id, lng: c[0], lat: c[1], kind: 'mobile', title: f.properties.title, ...(f.properties.speed > 0 ? { speed: f.properties.speed } : {}) });
    }
  }));
  if (results.every((r) => r.status === 'rejected')) throw new Error('mobile failed');
  return [...out.values()];
}

/** Cameras along the chosen route (none while no route is shown). */
export const routeCameras = signal<RouteCameras>({ status: 'idle' });

effect(() => {
  const st = routeState.value;
  const open = orteView.value === 'routes';
  const route = st.status === 'ok' ? (st.routes[Math.min(routeChoice.value, st.routes.length - 1)] ?? st.routes[0]) : undefined;
  if (!open || !route) {
    routeCameras.value = { status: 'idle' };
    return;
  }
  const line = route.coords as P[];
  routeCameras.value = { status: 'loading' };
  const ctl = new AbortController();
  const timer = setTimeout(() => {
    void Promise.allSettled([fixedCameras(line, ctl.signal), mobileCameras(line, ctl.signal)]).then(([fixed, mobile]) => {
      if (ctl.signal.aborted) return;
      batch(() => {
        routeCameras.value = fixed.status === 'rejected' && mobile.status === 'rejected'
          ? { status: 'error' }
          : { status: 'ok', mobileFailed: mobile.status === 'rejected', cameras: mergeNear([...(fixed.status === 'fulfilled' ? fixed.value : []), ...(mobile.status === 'fulfilled' ? mobile.value : [])]) };
      });
    });
  }, 400);
  return () => (clearTimeout(timer), ctl.abort());
});

/** Cameras as GeoJSON points for the route overlay. */
export const camerasToFeatures = (c: RouteCameras): FeatureCollection['features'] =>
  c.status === 'ok' ? c.cameras.map((x) => ({ type: 'Feature', properties: { cam: x.kind }, geometry: { type: 'Point', coordinates: [x.lng, x.lat] } })) : [];
