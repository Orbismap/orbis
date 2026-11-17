// Pure part of the tree layer: turns the point features of trees.pmtiles (OSM natural=tree, one tile zoom, 35 million points)
// into the samples of the tree channel. No map, no three.js. Tiles overlap and a city holds far more trees than can be drawn,
// so this removes duplicates, keeps what is inside the view and, above a cap, the trees nearest to the view's centre.
import type { TreeSample } from '../../ext/types';

export interface RawTree {
  lng: number;
  lat: number;
  props: Record<string, unknown>;
}

export interface TreeView {
  west: number;
  east: number;
  south: number;
  north: number;
  centreLng: number;
  centreLat: number;
}

/** Share of the view's size around it in which trees are still kept (they come into view while panning). */
export const VIEW_MARGIN = 0.25;
/** Most trees on the channel at once. */
export const MAX_TREES = 25_000;

const positive = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

export const LEAF_TYPES = { broadleaved: 'Laubbaum', needleleaved: 'Nadelbaum' } as const;
export const LEAF_CYCLES = { evergreen: 'Immergrün', deciduous: 'Laubabwerfend' } as const;

/** Puts a longitude into the copy of the world next to `centreLng`. */
const near = (lon: number, centreLng: number) => lon + 360 * Math.round((centreLng - lon) / 360);

export function buildTreeSamples(raw: readonly RawTree[], view: TreeView, max = MAX_TREES): TreeSample[] {
  const padLon = (view.east - view.west) * VIEW_MARGIN;
  const padLat = (view.north - view.south) * VIEW_MARGIN;
  const seen = new Set<string>();
  const kept: { sample: TreeSample; d: number }[] = [];
  for (const t of raw) {
    const lng = near(t.lng, view.centreLng);
    if (lng < view.west - padLon || lng > view.east + padLon || t.lat < view.south - padLat || t.lat > view.north + padLat) continue;
    const p = t.props;
    const id = p.id !== undefined ? String(p.id) : `${t.lng.toFixed(6)},${t.lat.toFixed(6)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const leafType = p.leaf_type === 'broadleaved' || p.leaf_type === 'needleleaved' ? p.leaf_type : undefined;
    const leafCycle = p.leaf_cycle === 'evergreen' || p.leaf_cycle === 'deciduous' ? p.leaf_cycle : undefined;
    const dx = (lng - view.centreLng) * Math.cos((view.centreLat * Math.PI) / 180);
    const dy = t.lat - view.centreLat;
    kept.push({ sample: { id, lng, lat: t.lat, heightM: positive(p.height), circumferenceM: positive(p.circumference), leafType, leafCycle }, d: dx * dx + dy * dy });
  }
  if (kept.length > max) kept.sort((a, b) => a.d - b.d).length = max;
  return kept.map((k) => k.sample);
}
