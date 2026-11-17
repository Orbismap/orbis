// Pure part of the tree layer: turns the features of trees.pmtiles (one tile zoom) into the samples of the tree channel. No map,
// no three.js. Layer `trees`: OSM natural=tree points (35 million). Layer `tree_lines`: natural=tree_row and barrier=hedge lines,
// which become trees every few metres (a row) or small bushes close together (a hedge). Tiles overlap and a city holds far more
// trees than can be drawn, so this removes duplicates, keeps what is inside the view and, above a cap, the trees nearest to the
// view's centre. The tiles carry no OSM ids: a tree is told apart (and seeded) by its position.
import type { TreeSample } from '../../ext/types';

export interface RawTree {
  lng: number;
  lat: number;
  props: Record<string, unknown>;
}

/** A line of trees.pmtiles layer `tree_lines`: `kind` 'row' | 'hedge', plus species, height, leaf_type, leaf_cycle. */
export interface RawTreeLine {
  coords: readonly (readonly [number, number])[];
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

/** The genus in lower case: the `genus` tag, else the first word of `species` ("Quercus robur" -> "quercus"). */
const genusOf = (p: Record<string, unknown>): string | undefined => {
  for (const v of [p.genus, p.species]) {
    const m = typeof v === 'string' ? /[A-Za-z]+/.exec(v) : null;
    if (m) return m[0].toLowerCase();
  }
  return undefined;
};

/** Distance between the trees of a row (m). */
export const ROW_SPACING_M = 10;
/** Height of a hedge without a tag (m), and the range a tagged one is held to. */
export const HEDGE_HEIGHT_M = 1.6;
const HEDGE_RANGE_M = [0.5, 6] as const;
/** Distance between the bushes of a hedge (m): they are about as wide as 0.7 of their height, so they close up. */
export const hedgeSpacing = (heightM: number) => Math.max(0.8, 0.7 * heightM);
const M_PER_DEG = 111_320;

/** Points every `spacing` metres along a line, starting at its first point (a short line gets at least that one). */
export function alongLine(coords: RawTreeLine['coords'], spacing: number): [number, number][] {
  const out: [number, number][] = [];
  let next = 0; // metres from the start where the next point goes
  let walked = 0;
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1]!;
    const [x1, y1] = coords[i]!;
    const kx = Math.cos(((y0 + y1) / 2) * Math.PI / 180) * M_PER_DEG;
    const len = Math.hypot((x1 - x0) * kx, (y1 - y0) * M_PER_DEG);
    for (; next <= walked + len; next += spacing) {
      const t = len > 0 ? (next - walked) / len : 0;
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
    walked += len;
  }
  if (!out.length && coords[0]) out.push([coords[0][0], coords[0][1]]);
  return out;
}

/** Puts a longitude into the copy of the world next to `centreLng`. */
const near = (lon: number, centreLng: number) => lon + 360 * Math.round((centreLng - lon) / 360);

export function buildTreeSamples(raw: readonly RawTree[], lines: readonly RawTreeLine[], view: TreeView, max = MAX_TREES): TreeSample[] {
  const padLon = (view.east - view.west) * VIEW_MARGIN;
  const padLat = (view.north - view.south) * VIEW_MARGIN;
  const seen = new Set<string>();
  const kept: { sample: TreeSample; d: number }[] = [];
  const add = (lng: number, lat: number, p: Record<string, unknown>, extra: Partial<TreeSample> = {}) => {
    lng = near(lng, view.centreLng);
    if (lng < view.west - padLon || lng > view.east + padLon || lat < view.south - padLat || lat > view.north + padLat) return;
    const id = `${lng.toFixed(6)},${lat.toFixed(6)}`;
    if (seen.has(id)) return;
    seen.add(id);
    const leafType = p.leaf_type === 'broadleaved' || p.leaf_type === 'needleleaved' ? p.leaf_type : undefined;
    const leafCycle = p.leaf_cycle === 'evergreen' || p.leaf_cycle === 'deciduous' ? p.leaf_cycle : undefined;
    const dx = (lng - view.centreLng) * Math.cos((view.centreLat * Math.PI) / 180);
    const dy = lat - view.centreLat;
    kept.push({ sample: { id, lng, lat, heightM: positive(p.height), circumferenceM: positive(p.circumference), leafType, leafCycle, genus: genusOf(p), ...extra }, d: dx * dx + dy * dy });
  };
  for (const t of raw) add(t.lng, t.lat, t.props);
  for (const l of lines) {
    const hedge = l.props.kind === 'hedge';
    // a hedge always carries its height (tagged or the default): the bushes are spaced by it, Pro draws them at it
    const height = Math.min(HEDGE_RANGE_M[1], Math.max(HEDGE_RANGE_M[0], positive(l.props.height) ?? HEDGE_HEIGHT_M));
    const spacing = hedge ? hedgeSpacing(height) : ROW_SPACING_M;
    const extra: Partial<TreeSample> = hedge ? { hedge: true, heightM: height } : {};
    for (const [lng, lat] of alongLine(l.coords, spacing)) add(lng, lat, l.props, extra);
  }
  if (kept.length > max) kept.sort((a, b) => a.d - b.d).length = max;
  return kept.map((k) => k.sample);
}
