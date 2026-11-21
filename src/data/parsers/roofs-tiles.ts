// Roofs from the PMTiles `roofs` (layer `roofs`, zoom 15, built by the data repo, collectors/osm-themes.mjs): one MultiPolygon per building or
// building part that carries a roof tag, the properties are the OSM keys (`roof:shape`, `height`, `building:levels` …). The same tags
// the model reads from Overpass (data/parsers/gebaeude.ts), so Orbis Pro gets the same `BuildingSample`s.
import type { BuildingSample } from '../../ext/types';

type P = [number, number];
export interface RoofTileFeature {
  geometry: { type: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
}

/** The model draws a few thousand samples; the same cap as the Overpass source. */
export const MAX_ROOF_SAMPLES = 9000;

const isP = (c: unknown): c is P => Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number';
const ring = (r: unknown): P[] => (Array.isArray(r) ? r.filter(isP).map((c) => [c[0], c[1]] as P) : []);

/**
 * The samples of the features a map query returned. The tiles carry no OSM id, so the id is the first corner of the outline:
 * a building that comes from two neighbouring tiles (or twice from the same one) is one sample. Features without a ring of at
 * least 4 points are dropped; only string tags are kept.
 */
export function roofSamples(features: readonly RoofTileFeature[], max = MAX_ROOF_SAMPLES): BuildingSample[] {
  const out = new Map<string, BuildingSample>();
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' && Array.isArray(g.coordinates) ? g.coordinates : [];
    const tags: Record<string, string> = {};
    for (const [k, v] of Object.entries(f.properties ?? {})) if (typeof v === 'string' && v !== '') tags[k] = v;
    const part = tags['building:part'] !== undefined && tags.building === undefined;
    for (const poly of polys) {
      const rings = Array.isArray(poly) ? poly.map(ring).filter((r) => r.length >= 4) : [];
      const outer = rings[0];
      if (!outer) continue;
      const id = `t${outer[0]![0].toFixed(6)},${outer[0]![1].toFixed(6)}${part ? 'p' : ''}`;
      if (!out.has(id)) out.set(id, { id, part, rings, tags });
      if (out.size >= max) return [...out.values()];
    }
  }
  return [...out.values()];
}

/** A building of the 2.5D layer (OpenFreeMap): its feature id and its outer ring. */
export interface FlatBuilding { id: number; ring: [number, number][] }

const inRing = (x: number, y: number, ring: readonly P[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const centre = (ring: readonly P[]): P => {
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
};
const bbox = (ring: readonly P[]) => {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return { w, s, e, n };
};

/**
 * The ids of the 2.5D buildings that lie where a roof sample is drawn in 3D. The tiles share no ids with OpenFreeMap, so a flat building
 * counts as covered when the middle of its outline lies in a roof's outline (and not in a hole), or the middle of the roof's outline
 * lies in the flat building: the same OSM building drawn twice has the same shape, and either middle may fall outside a concave one.
 */
export function coveredIds(flat: readonly FlatBuilding[], roofs: readonly BuildingSample[]): number[] {
  const boxes = roofs.map((r) => ({ r, b: bbox(r.rings[0]!), c: centre(r.rings[0]!) }));
  const out: number[] = [];
  for (const f of flat) {
    if (f.ring.length < 4) continue;
    const fc = centre(f.ring);
    const fb = bbox(f.ring);
    for (const { r, b, c } of boxes) {
      if (fb.e < b.w || fb.w > b.e || fb.n < b.s || fb.s > b.n) continue;
      const inRoof = inRing(fc[0], fc[1], r.rings[0]!) && !r.rings.slice(1).some((h) => inRing(fc[0], fc[1], h));
      if (inRoof || inRing(c[0], c[1], f.ring)) { out.push(f.id); break; }
    }
  }
  return out;
}

/** A building of the 2.5D tiles (OpenFreeMap `building` layer) as the map query returns it. */
export interface FlatFeature {
  id?: number | string;
  geometry: { type: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
}

/** The outer ring of the first polygon of a flat feature (for `coveredIds`), if it has one. */
export const flatRing = (f: FlatFeature): [number, number][] | undefined => {
  const c = f.geometry?.coordinates;
  const r = f.geometry?.type === 'Polygon' ? (c as unknown[])?.[0] : f.geometry?.type === 'MultiPolygon' ? (c as unknown[][])?.[0]?.[0] : undefined;
  const out = ring(r);
  return out.length >= 4 ? out : undefined;
};

const MAX_FLAT_SAMPLES = 8000;

/**
 * Samples for the plain buildings of the 2.5D tiles that no roof sample replaces: Orbis Pro draws them too (flat roof, the height and
 * colour OpenFreeMap knows), so that in the close view ONE renderer draws all buildings. The outlines OpenFreeMap hides because they
 * have parts (`hide_3d`) stay out, like in the 2.5D layer; `skip` holds the ids of the buildings a roof sample covers.
 */
export function flatSamples(features: readonly FlatFeature[], skip: ReadonlySet<number | string>, max = MAX_FLAT_SAMPLES): BuildingSample[] {
  const out = new Map<string, BuildingSample>();
  for (const f of features) {
    if (out.size >= max) break;
    if (f.id === undefined || skip.has(f.id) || !f.geometry || f.properties?.hide_3d) continue;
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' && Array.isArray(g.coordinates) ? g.coordinates : [];
    const p = f.properties ?? {};
    const tags: Record<string, string> = { building: 'yes' };
    const h = Number(p.render_height);
    const base = Number(p.render_min_height);
    if (h > 0) tags.height = String(h);
    if (base > 0) tags.min_height = String(base);
    if (typeof p.colour === 'string' && p.colour) tags['building:colour'] = p.colour;
    polys.forEach((poly) => {
      const rings = Array.isArray(poly) ? poly.map(ring).filter((r) => r.length >= 4) : [];
      // a building the tile edge cuts comes as one piece per tile with the same id: the first corner tells the pieces apart (and the same piece twice from one)
      const id = rings[0] ? `o${f.id}@${rings[0][0]![0].toFixed(6)},${rings[0][0]![1].toFixed(6)}` : '';
      if (rings.length && out.size < max && !out.has(id)) out.set(id, { id, part: false, rings, tags });
    });
  }
  return [...out.values()];
}
