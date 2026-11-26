// Reads the points of single tiles straight from a PMTiles archive (for questions about a place, without a map).
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import type { PMTiles } from 'pmtiles';

export interface TilePoint { lng: number; lat: number; properties: Record<string, unknown> }

/** Fractional tile position of a lon/lat at zoom `z` (the integer part is the tile). */
export function tilePosition(lng: number, lat: number, z: number): [x: number, y: number] {
  const n = 2 ** z;
  return [((lng + 180) / 360) * n, ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n];
}

/** The tile that holds a lon/lat, clamped to the world. */
export function tileOf(lng: number, lat: number, z: number): [x: number, y: number] {
  const n = 2 ** z;
  const [x, y] = tilePosition(lng, lat, z);
  return [Math.min(n - 1, Math.max(0, Math.floor(x))), Math.min(n - 1, Math.max(0, Math.floor(y)))];
}

/** The point features of one layer in one tile (empty for a missing tile or layer). */
export async function readTilePoints(pm: PMTiles, layer: string, z: number, x: number, y: number, signal?: AbortSignal): Promise<TilePoint[]> {
  const tile = await pm.getZxy(z, x, y, signal);
  if (!tile) return [];
  const features = new VectorTile(new PbfReader(new Uint8Array(tile.data))).layers[layer];
  const out: TilePoint[] = [];
  for (let i = 0; features && i < features.length; i++) {
    const f = features.feature(i);
    const g = f.toGeoJSON(x, y, z).geometry;
    if (g.type === 'Point') out.push({ lng: g.coordinates[0]!, lat: g.coordinates[1]!, properties: f.properties });
  }
  return out;
}
