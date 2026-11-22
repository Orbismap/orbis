// Cuts the footprints of 3D landmarks out of the building layer of an OpenFreeMap tile. OpenFreeMap merges neighbouring buildings
// into one feature (its id then ends in 0), so a landmark's building cannot be left out by id alone: every polygon is subtracted
// spatially, component by component, and a merged feature is never dropped as a whole (its other parts may be blocks away).
// Ported from web/building-geometry.ts of https://github.com/alexwohlbruck/landmarks (CC0 1.0).
import { classifyRings, VectorTile } from '@mapbox/vector-tile';
import { fromVectorTileJs, GeoJSONWrapper, type Feature } from '@maplibre/vt-pbf';
import { PbfReader } from 'pbf';
import clipping, { type MultiPolygon, type Pair, type Polygon } from 'polygon-clipping';

export type { MultiPolygon };
/** What a landmark takes out of the map: its outline (lng/lat) and the feature ids of the buildings it stands in for. */
export interface Footprint { geometry: MultiPolygon; ids: number[] }
export interface TileCoordinate { z: number; x: number; y: number }
type Bounds = [number, number, number, number];

export function tilePoint([lng, lat]: Pair, tile: TileCoordinate, extent: number): Pair {
  const n = 2 ** tile.z;
  return [((lng + 180) / 360 * n - tile.x) * extent, ((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n - tile.y) * extent];
}
const ringArea = (ring: Pair[]) => ring.reduce((sum, p, i) => {
  const q = ring[(i + 1) % ring.length]!;
  return sum + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;
export const geometryArea = (g: MultiPolygon) => g.reduce((sum, polygon) =>
  sum + Math.abs(ringArea(polygon[0]!)) - polygon.slice(1).reduce((n, ring) => n + Math.abs(ringArea(ring)), 0), 0);
function bounds(g: MultiPolygon): Bounds {
  const b: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of g.flat(2) as unknown as Pair[]) {
    b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]);
    b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]);
  }
  return b;
}
const overlaps = (a: Bounds, b: Bounds) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** A mask with its bounds, measured once per tile (not once per polygon of it). */
interface Mask { shape: MultiPolygon; box: Bounds }

/** A polygon of a tile without the masks: nothing when a mask covers it (nearly), else what is left. `union` memoises the union of the masks near the polygon: a tile's polygons mostly see the same few. */
export function subtractFootprints(polygon: Polygon, masks: readonly Mask[], union = new Map<string, MultiPolygon>()): MultiPolygon {
  const box = bounds([polygon]);
  const nearby = masks.filter((m) => overlaps(box, m.box));
  if (!nearby.length) return [polygon];
  const shapes = nearby.map((m) => m.shape);
  const area = geometryArea([polygon]);
  const key = nearby.map((m) => masks.indexOf(m)).join(',');
  let merged = union.get(key);
  if (!merged) { merged = clipping.union(shapes[0]!, ...shapes.slice(1)); union.set(key, merged); }
  const covered = clipping.intersection([polygon], merged);
  // tile vertices are quantised and simplified: a matching footprint may differ by a fraction of a pixel; the whole matched
  // component goes, so no thin extruded walls remain along its edge
  if (geometryArea(covered) >= area * 0.8) return [];
  if (!covered.length) return [polygon];
  return clipping.difference([polygon], ...shapes);
}

/** Rewrites only the building layer of a tile (height, base, colour and holes stay); every other layer is dropped. */
export function replaceBuildingTile(bytes: Uint8Array, tile: TileCoordinate, footprints: readonly Footprint[]): Uint8Array {
  const source = new VectorTile(new PbfReader(bytes)).layers.building;
  if (!source) return fromVectorTileJs({ layers: {} } as never);
  const masks = footprints.map((f) => f.geometry.map((p) => p.map((r) => r.map((pt) => tilePoint(pt, tile, source.extent)))))
    .map((shape): Mask => ({ shape, box: bounds(shape) }))
    .filter((m) => overlaps(m.box, [-16, -16, source.extent + 16, source.extent + 16]));
  const unions = new Map<string, MultiPolygon>();
  // no landmark touches this tile: it is passed on as it is, not decoded and encoded again
  if (!masks.length && !footprints.some((f) => f.ids.length)) return bytes;
  const exactIds = new Set(footprints.flatMap((f) => f.ids));
  const features: Feature[] = [];
  for (let i = 0; i < source.length; i++) {
    const feature = source.feature(i);
    // an unmerged id is reliable; merged ones (ending in 0) are always processed spatially
    if (feature.id !== undefined && feature.id % 10 !== 0 && exactIds.has(feature.id)) continue;
    for (const polygon of classifyRings(feature.loadGeometry())) {
      const rings: Polygon = polygon.map((r) => r.map((p) => [p.x, p.y] as Pair));
      for (const piece of subtractFootprints(rings, masks, unions)) {
        const geometry = piece.map((ring) => ring.map(([x, y]): Pair => [Math.round(x), Math.round(y)])).filter((r) => r.length >= 4 && Math.abs(ringArea(r)) > 0);
        if (geometry.length) features.push({ id: features.length + 1, type: 3, tags: feature.properties, geometry } as Feature);
      }
    }
  }
  const out = new GeoJSONWrapper(features, { version: 2, extent: source.extent });
  out.name = 'building';
  return fromVectorTileJs({ layers: { building: out } } as never);
}
