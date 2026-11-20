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
