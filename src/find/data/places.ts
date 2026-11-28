// The places around a position: tiles are read ring by ring until the nearest place is certainly the nearest.
import { haversine, type LngLat } from '@/core/geo';
import { tilePosition, type TilePoint } from '@/data/tilePoints';
import type { Kind, Place } from './kinds';

/** Rings around the own tile that are searched at most, unless the kind says otherwise (4: a square of 9 tiles, about 6 km to each side in central Europe). */
export const MAX_RING = 4;
const EQUATOR_M = 40_075_016;

export const metres = (a: LngLat, b: LngLat): number => haversine(a, b) * 1000;

/** The tiles of ring `r` around (x, y): the tile itself for 0, else the border of the square of side 2r + 1. */
export function ringTiles(x: number, y: number, r: number, z: number): [number, number][] {
  const n = 2 ** z;
  const out: [number, number][] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || y + dy < 0 || y + dy >= n) continue;
      out.push([(((x + dx) % n) + n) % n, y + dy]);
    }
  }
  return out;
}

/** Radius in metres around `at` that the tiles up to ring `r` cover completely. */
export function coveredRadius(at: LngLat, r: number, z: number): number {
  const [x, y] = tilePosition(at[0], at[1], z);
  const side = (EQUATOR_M * Math.cos((at[1] * Math.PI) / 180)) / 2 ** z;
  const fx = x - Math.floor(x), fy = y - Math.floor(y);
  return (r + Math.min(fx, 1 - fx, fy, 1 - fy)) * side;
}

export interface Search { places: Place[]; radius: number }

/**
 * All usable places in the rings that were needed, at least the 3 x 3 tiles around `at` (the map shows them too). Stops as soon
 * as a place lies within the completely covered radius.
 */
export async function searchPlaces(kind: Kind, at: LngLat, read: (x: number, y: number) => Promise<TilePoint[]>): Promise<Search> {
  const zoom = kind.tiles.zoom;
  const [x, y] = tilePosition(at[0], at[1], zoom).map(Math.floor) as [number, number];
  const found = new Map<string, Place>();
  let nearest = Infinity;
  let radius = 0;
  for (let r = 0; r <= (kind.rings ?? MAX_RING); r++) {
    const tiles = await Promise.all(ringTiles(x, y, r, zoom).map(([tx, ty]) => read(tx, ty)));
    for (const point of tiles.flat()) {
      const place = kind.place(point.properties, point.lng, point.lat, point.id);
      if (!place || found.has(place.key)) continue;
      found.set(place.key, place);
      nearest = Math.min(nearest, metres(at, [place.lng, place.lat]));
    }
    radius = coveredRadius(at, r, zoom);
    if (r >= 1 && nearest <= radius) break;
  }
  return { places: [...found.values()], radius };
}

/** An object entered from this app, as the tile set would carry it; `set`: the id of its kind. */
export interface OwnEntry { set: string; lng: number; lat: number; properties: Record<string, unknown>; at: number }
/** Own entries further away than this are not "around". */
export const OWN_RANGE_M = 5000;

/** The found places with one's own entries nearby that the data do not carry yet. */
export function withOwn(kind: Kind, found: Place[], own: readonly OwnEntry[], at: LngLat | null): Place[] {
  if (!at) return found;
  const known = new Set(found.map((p) => p.key));
  const extra = own
    .filter((e) => e.set === kind.id && metres(at, [e.lng, e.lat]) <= OWN_RANGE_M)
    .map((e) => kind.place(e.properties, e.lng, e.lat))
    .filter((p): p is Place => !!p && !known.has(p.key));
  return extra.length ? [...found, ...extra] : found;
}
