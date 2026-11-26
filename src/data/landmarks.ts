// 3D landmarks: the CC0 low-poly models of https://github.com/alexwohlbruck/landmarks (published at landmarks.barrelman.dev).
// The site is a static dataset: `api/v1/latest.json` points at a release catalogue (small: the tile index with the occupied
// z12 tiles), and every occupied tile has a JSON with the landmarks in it (anchor, bearing, scale, OSM ids it replaces, model
// URLs by content hash). Models are CC0-1.0; the placements are derived from OpenStreetMap (ODbL, © OpenStreetMap contributors).
import { signal } from '@preact/signals';
import type { LandmarkSample } from '../ext/types';
import type { MultiPolygon } from 'polygon-clipping';

/** Where the dataset lives; overridable like the other buckets (`.env`). */
export const LANDMARKS_BASE = ((import.meta.env?.VITE_LANDMARKS_BASE as string | undefined)?.trim() || 'https://landmarks.barrelman.dev').replace(/\/$/, '');
export const LANDMARKS_REPO = 'https://github.com/alexwohlbruck/landmarks';
export const LANDMARKS_SITE = 'https://landmarks.barrelman.dev/';
/** The credit line (map corner and sources list). */
export const LANDMARKS_CREDIT = '3D-Wahrzeichen: Landmarks von Alex Wohlbruck und Claude (CC0)';
export const LANDMARKS_LICENSE = 'Modelle CC0 1.0, Standorte © OpenStreetMap-Mitwirkende (ODbL)';

/** The tile zoom of the dataset's index. */
export const INDEX_ZOOM = 12;

/** True while landmarks are drawn (written by the source): the sources list names them then. */
export const landmarksShown = signal(false);
/** What the layer stack has to leave out because a model stands in for it. */
export interface LandmarkMask {
  /** feature ids of the OpenFreeMap tiles (OSM id × 10 + 1 node, + 2 way, + 3 relation) */
  ids: ReadonlySet<number>;
  /** [west, south, east, north] of every model in view */
  boxes: readonly (readonly [number, number, number, number])[];
  /** the outlines of the replaced buildings (lng/lat), where the dataset has them: spatial, for merged tile features */
  footprints: readonly { geometry: MultiPolygon; ids: number[] }[];
}
export const EMPTY_MASK: LandmarkMask = { ids: new Set(), boxes: [], footprints: [] };
export const landmarkMask = signal<LandmarkMask>(EMPTY_MASK);

/**
 * The OSM outlines the dataset cuts out of the basemap, by landmark id (~2.8 MB, ODbL, © OpenStreetMap contributors). They are not part
 * of the published API, only of the demo's source, so they come from a pinned commit through jsDelivr; once, when the first landmark is in view.
 */
export const FOOTPRINTS_URL = 'https://cdn.jsdelivr.net/gh/alexwohlbruck/landmarks@a5945afdc50d14bb02bae0c41f42afa3c7451063/web/replacement-footprints.json';
let footprints: Promise<Record<string, MultiPolygon>> | undefined;
export function loadFootprints(): Promise<Record<string, MultiPolygon>> {
  footprints ??= getJson<{ assets?: Record<string, MultiPolygon> }>(FOOTPRINTS_URL).then((j) => j.assets ?? {});
  footprints.catch(() => { footprints = undefined; });
  return footprints;
}

export interface Catalogue {
  /** the release the catalogue belongs to: its files vanish when a newer release replaces it */
  release: string;
  template: string;
  occupied: ReadonlySet<string>;
  /** path of the list of all landmarks of the release (assets.json, ~1.5 MB compressed): the layer "Landmarks" shows them as points */
  assets?: string;
}

class HttpError extends Error {
  constructor(readonly status: number, url: string) { super(`landmarks: ${status} ${url}`); }
}

/** JSON of a URL; a non-2xx answer (404 page, 503 of the CDN) is an error, not something to parse. */
async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new HttpError(r.status, url);
  return (await r.json()) as T;
}

interface RawOsm { type?: string; id?: number }
interface RawAsset {
  id?: string;
  name?: string;
  anchor?: [number, number];
  minZoom?: number;
  height?: number;
  elevation?: number;
  bounds?: [number, number, number, number];
  osm?: RawOsm | null;
  additionalOsm?: RawOsm[];
  lods?: { low?: { url?: string; bytes?: number } };
  placement?: { bearing?: number; scale?: number };
  artisticLicense?: string;
  credits?: { name?: string; kind?: string }[];
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** The feature id OpenFreeMap gives a building of OSM (planetiler: id × 10, plus 2 for a way and 3 for a relation). */
export function ofmId(o: RawOsm | null | undefined): number | undefined {
  if (!o || typeof o.id !== 'number') return undefined;
  if (o.type === 'node') return o.id * 10 + 1;
  if (o.type === 'way') return o.id * 10 + 2;
  if (o.type === 'relation') return o.id * 10 + 3;
  return undefined;
}

/** The landmarks of a tile (or of the whole assets list) as samples; entries without anchor or model are dropped. */
export function parseLandmarks(json: unknown, base = LANDMARKS_BASE): LandmarkSample[] {
  const assets = (json as { assets?: RawAsset[] } | null)?.assets;
  if (!Array.isArray(assets)) return [];
  const out: LandmarkSample[] = [];
  for (const a of assets) {
    const url = a.lods?.low?.url;
    const [lng, lat] = a.anchor ?? [];
    if (!a.id || typeof lng !== 'number' || typeof lat !== 'number' || !url) continue;
    // CC0 only: a model under another licence would need its own credit line, which this layer does not carry
    if (a.artisticLicense && a.artisticLicense !== 'CC0-1.0') continue;
    const b = a.bounds;
    const ids = [a.osm, ...(a.additionalOsm ?? [])].map(ofmId).filter((v): v is number => v !== undefined);
    out.push({
      id: a.id,
      name: a.name ?? a.id,
      lng,
      lat,
      elevationM: num(a.elevation, 0),
      minZoom: num(a.minZoom, 15),
      heightM: num(a.height, 0),
      url: url.startsWith('http') ? url : base + url,
      bounds: b && b.length === 4 ? [b[0], b[1], b[2], b[3]] : [lng, lat, lng, lat],
      osmIds: ids,
    });
  }
  return out;
}

/** The z12 tile of a point. */
export function tileOf(lng: number, lat: number, z = INDEX_ZOOM): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
}

/** The occupied index tiles that touch a view; at most `max`, nearest to the middle first. */
export function tilesInView(cat: Catalogue, west: number, south: number, east: number, north: number, max = 16): string[] {
  const [x0, y0] = tileOf(west, north);
  const [x1, y1] = tileOf(east, south);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const found: { key: string; d: number }[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const key = `${x}/${y}`;
      if (cat.occupied.has(key)) found.push({ key, d: (x - cx) ** 2 + (y - cy) ** 2 });
    }
  }
  return found.sort((a, b) => a.d - b.d).slice(0, max).map((f) => f.key);
}

let catalogue: Promise<Catalogue> | undefined;
let current: Catalogue | undefined;
/** The release catalogue, once (a few kB). A failure is not remembered, the next call tries again. */
export function loadCatalogue(): Promise<Catalogue> {
  catalogue ??= (async () => {
    // `no-cache`: always ask whether `latest` moved on, a stale pointer leads to files of a release that is gone
    const latest = await getJson<{ catalogue?: string; release?: string }>(`${LANDMARKS_BASE}/api/v1/latest.json`, { cache: 'no-cache' });
    if (!latest.catalogue) throw new Error('landmarks: no catalogue');
    const cat = await getJson<{ release?: string; assets?: string; index?: { template?: string; occupied?: string[] } }>(LANDMARKS_BASE + latest.catalogue);
    if (!cat.index?.template || !Array.isArray(cat.index.occupied)) throw new Error('landmarks: no index');
    return (current = { release: cat.release ?? latest.release ?? latest.catalogue, template: cat.index.template, occupied: new Set(cat.index.occupied), assets: cat.assets });
  })();
  catalogue.catch(() => { catalogue = undefined; });
  return catalogue;
}

/** Asks `latest` again: for whoever is about to load a large file of the release (it vanishes with the release). */
export function reloadCatalogue(): Promise<Catalogue> {
  catalogue = undefined;
  return loadCatalogue();
}

let refreshing: Promise<Catalogue> | undefined;
/** After a 404 of a release's file: fetch `latest` again (once for all callers); resolves to the newer catalogue, or the same release if none. */
function refreshCatalogue(stale: Catalogue): Promise<Catalogue> {
  if (current && current.release !== stale.release) return Promise.resolve(current);
  refreshing ??= reloadCatalogue().finally(() => { refreshing = undefined; });
  return refreshing;
}

const tiles = new Map<string, Promise<LandmarkSample[]>>();
const tileUrl = (cat: Catalogue, key: string) => {
  const [x, y] = key.split('/');
  return LANDMARKS_BASE + cat.template.replace('{x}', x!).replace('{y}', y!);
};

async function fetchTile(cat: Catalogue, key: string): Promise<LandmarkSample[]> {
  try {
    return parseLandmarks(await getJson(tileUrl(cat, key)));
  } catch (e) {
    if (!(e instanceof HttpError) || e.status !== 404) throw e;
    // the release this session started with was replaced: go on with the new one (its tile, if it has one)
    const fresh = await refreshCatalogue(cat);
    if (fresh.release === cat.release || !fresh.occupied.has(key)) return [];
    return parseLandmarks(await getJson(tileUrl(fresh, key)));
  }
}

/** The landmarks of one index tile (`x/y`); cached, failed tiles are asked again next time. */
export function loadTile(cat: Catalogue, key: string): Promise<LandmarkSample[]> {
  const id = `${cat.release}/${key}`;
  let hit = tiles.get(id);
  if (!hit) {
    hit = fetchTile(cat, key);
    hit.catch(() => tiles.delete(id));
    tiles.set(id, hit);
  }
  return hit;
}

/** The mask of the landmarks that are drawn: the OSM buildings they replace (`shapes`: their outlines by landmark id, if loaded). */
export function maskOf(items: readonly LandmarkSample[], shapes: Record<string, MultiPolygon> = {}): LandmarkMask {
  const ids = new Set<number>();
  for (const l of items) for (const id of l.osmIds) ids.add(id);
  return {
    ids,
    boxes: items.map((l) => l.bounds),
    footprints: items.map((l) => ({ geometry: shapes[l.id] ?? [], ids: l.osmIds })),
  };
}

/** Is a point inside one of the boxes? */
export const inBoxes = (lng: number, lat: number, boxes: LandmarkMask['boxes']) =>
  boxes.some(([w, s, e, n]) => lng >= w && lng <= e && lat >= s && lat <= n);

/** Is the point inside the outline (any polygon, minus its holes)? */
export function inFootprint(lng: number, lat: number, g: MultiPolygon): boolean {
  const inRing = (ring: [number, number][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return g.some((poly) => inRing(poly[0]!) && !poly.slice(1).some(inRing));
}
