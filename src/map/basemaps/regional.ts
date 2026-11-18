// Regional basemaps: generated from the editor-layer-index (scripts/build-regional-basemaps.mjs) plus the hand-written
// swisstopo ones. The ids are known synchronously (validation), the data (tile URLs, bounds, attribution) loads lazily.
import { signal } from '@preact/signals';
import type { SourceSpecification } from 'maplibre-gl';
import type { BasemapId } from '../types';
import { rasterDef } from './raster';
import type { BasemapDef } from './types';
import { REGIONAL_ALIASES, REGIONAL_IDS, REGIONAL_STATIC_ALIASES } from './regional.ids.generated';

export type Bounds = [number, number, number, number];

/** One tile layer. A single regional map is one member; a series (yearly editions) lists its members newest first. */
export interface Member {
  u: string | string[]; s?: 'tms'; z0?: number; z1: number; b: Bounds;
  /** year of the edition (absent: the current layer without a year, ordered first) */
  y?: number;
  a?: string; r?: string; l?: string;
}
/** One entry of regional.generated.json (short keys keep the file small): either a single layer or a series (`m`). */
export interface RegionalEntry extends Partial<Member> {
  i: string; n: string; c?: string; k: string; b: Bounds;
  m?: Member[];
}

/** What the picker needs of any regional basemap, static (swisstopo) or generated. */
export interface RegionalItem { id: BasemapId; label: string; country?: string; bounds: Bounds; area: number; /** bounds of the members of a series */ parts?: Bounds[] }

const ID_SET = new Set<string>(REGIONAL_IDS);
export const isRegionalId = (v: unknown): v is BasemapId => typeof v === 'string' && (ID_SET.has(v) || Object.hasOwn(REGIONAL_ALIASES, v) || Object.hasOwn(REGIONAL_STATIC_ALIASES, v));
/** Ids of merged yearly entries map to their series, ids of entries that became static basemaps to those; everything else stays as it is. */
export const canonicalRegionalId = (id: string): string => (Object.hasOwn(REGIONAL_ALIASES, id) ? REGIONAL_ALIASES[id]! : Object.hasOwn(REGIONAL_STATIC_ALIASES, id) ? REGIONAL_STATIC_ALIASES[id]! : id);

/** True once regional.generated.json has been loaded. */
export const regionalReady = signal(false);
let entries: Map<string, RegionalEntry> | undefined;
let loading: Promise<void> | undefined;

export function loadRegional(): Promise<void> {
  return (loading ??= import('./regional.generated.json')
    .then((m) => {
      entries = new Map((m.default as unknown as RegionalEntry[]).map((e) => [e.i, e]));
      regionalReady.value = true;
    })
    .catch((e) => {
      loading = undefined; // allow a retry
      throw e;
    }));
}

export const regionalEntry = (id: string): RegionalEntry | undefined => entries?.get(canonicalRegionalId(id));

/** Layers of an entry, newest first (a single map is its own only member). */
export const membersOf = (e: RegionalEntry): Member[] => e.m ?? [e as Member];

/** Label with the covered years for a series, e.g. "Mecklenburg-Vorpommern DOP20 (2019–aktuell)". */
export function entryLabel(e: RegionalEntry): string {
  if (!e.m) return e.n;
  const ys = e.m.map((m) => m.y).filter((y): y is number => y !== undefined);
  if (!ys.length) return e.n;
  const lo = Math.min(...ys), hi = e.m.some((m) => m.y === undefined) ? 'aktuell' : String(Math.max(...ys));
  return lo === Number(hi) ? `${e.n} (${lo})` : `${e.n} (${lo}–${hi})`;
}

/**
 * Stacking cap of a series: at most this many members (newest first) that touch the view are drawn at the same time.
 * Every member costs its own tile requests (WMS GetMap per tile), so a series with 30 yearly editions must not load
 * all of them. Trade-off: where more than STACK_CAP editions overlap the view, the oldest ones are left out until the
 * view gets smaller; places only they cover stay empty until then.
 */
export const STACK_CAP = 6;

/** Indices (into membersOf, newest first) of the members to draw for `view`: those touching it, capped. */
export function activeMembers(e: RegionalEntry, view: Bounds | undefined): number[] {
  const out: number[] = [];
  membersOf(e).forEach((m, i) => {
    if (out.length < STACK_CAP && (!view || intersects(view, m.b))) out.push(i);
  });
  return out;
}

export const memberIds = (id: string, idx: number) => ({ source: `bm-${id}-m${idx}`, layer: `bm-${id}-m${idx}-tiles` });

const LIGHT_CATEGORIES = new Set(['map', 'osmbasedmap', 'historicmap', 'elevation']);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const memberSource = (m: Member): SourceSpecification => ({
  type: 'raster',
  tiles: Array.isArray(m.u) ? m.u : [m.u],
  tileSize: 256,
  minzoom: m.z0 ?? 0,
  maxzoom: m.z1,
  bounds: m.b,
  ...(m.s ? { scheme: m.s } : {}),
  ...(m.a ? { attribution: esc(m.a) } : {}),
});

const defs = new Map<string, BasemapDef>();
/**
 * MapLibre basemap definition of a generated entry (undefined until the data is loaded): a background layer and the
 * layers of ALL members, oldest at the bottom. The engine adds only the members for the current view (see activeMembers).
 */
export function regionalDef(id: string): BasemapDef | undefined {
  const e = regionalEntry(id);
  if (!e) return undefined;
  const cached = defs.get(e.i);
  if (cached) return cached;
  const d = rasterDef(e.i as BasemapId, entryLabel(e), memberSource(membersOf(e)[0]!), { light: LIGHT_CATEGORIES.has(e.k) });
  const sources: BasemapDef['sources'] = {};
  const layers: BasemapDef['layers'] = [d.layers[0]!];
  membersOf(e).forEach((m, i) => {
    const ids = memberIds(e.i, i);
    sources[ids.source] = memberSource(m);
    layers.splice(1, 0, // newest first, each inserted right above the background: the oldest ends up lowest
      { ...d.layers[1]!, id: ids.layer, source: ids.source } as never);
  });
  const def = { ...d, sources, layers, bounds: e.b };
  defs.set(e.i, def);
  return def;
}

const WORLD: Bounds = [-180, -85.051, 180, 85.051];
export const isWorldwide = (b: Bounds) => b[2] - b[0] >= 359;
export const boundsArea = (b: Bounds) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);

/** Does the view (west/east may run past ±180 on the globe) touch the bounds? */
export function intersects(view: Bounds, b: Bounds): boolean {
  if (view[1] > b[3] || view[3] < b[1]) return false;
  if (view[2] - view[0] >= 360 || isWorldwide(b)) return true;
  const west = ((((view[0] + 180) % 360) + 360) % 360) - 180;
  const east = west + (view[2] - view[0]);
  return [-360, 0, 360].some((o) => west <= b[2] + o && east >= b[0] + o);
}

export const toItem = (e: RegionalEntry): RegionalItem => ({ id: e.i as BasemapId, label: entryLabel(e), country: e.c, bounds: e.b, area: boundsArea(e.b), ...(e.m ? { parts: e.m.map((m) => m.b) } : {}) });
export const allGenerated = (): RegionalItem[] => (entries ? [...entries.values()].map(toItem) : []);
export { WORLD };
