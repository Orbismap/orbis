// The area of an offline map – the rectangle one looked at, or the outline of a city – and the map tiles that cover it.
import { tileOf } from '@/data/tilePoints';

/** [west, south, east, north] */
export type Box = [number, number, number, number];
export type Ring = [lng: number, lat: number][];
/** the first ring of a polygon is its outside, the others are holes */
export type Polygon = Ring[];
export type Shape = { type: 'box'; box: Box } | { type: 'outline'; box: Box; polygons: Polygon[] };
export interface TileId { z: number; x: number; y: number }

/** The base map has tiles up to here; closer zooms are drawn from them. */
export const MAX_ZOOM = 14;

export function boxOf(polygons: Polygon[]): Box {
  let w = 180, s = 90, e = -180, n = -90;
  for (const polygon of polygons) {
    for (const [lng, lat] of polygon[0] ?? []) {
      w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
    }
  }
  return [w, s, e, n];
}

const lngOf = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const latOf = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
export const tileBox = ({ z, x, y }: TileId): Box => [lngOf(x, z), latOf(y + 1, z), lngOf(x + 1, z), latOf(y, z)];

/** Whether the line from a to b touches the box (Liang–Barsky). */
function crosses([ax, ay]: [number, number], [bx, by]: [number, number], [w, s, e, n]: Box): boolean {
  let from = 0, to = 1;
  const dx = bx - ax, dy = by - ay;
  for (const [p, q] of [[-dx, ax - w], [dx, e - ax], [-dy, ay - s], [dy, n - ay]] as const) {
    if (p === 0) {
      if (q < 0) return false;
    } else if (p < 0) from = Math.max(from, q / p);
    else to = Math.min(to, q / p);
  }
  return from <= to;
}

/** Even–odd over all rings, so that holes are outside. */
function inside([x, y]: [number, number], polygon: Polygon): boolean {
  let hit = false;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i]!, [bx, by] = ring[j]!;
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) hit = !hit;
    }
  }
  return hit;
}

export function touches(box: Box, polygons: Polygon[]): boolean {
  return polygons.some((polygon) =>
    polygon.some((ring) => ring.some((point, i) => crosses(point, ring[(i + 1) % ring.length]!, box)))
    // no edge in the box: it lies completely inside or completely outside
    || inside([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], polygon));
}

/**
 * All tiles from zoom 0 to 14 that cover the shape, coarse ones first. Null as soon as there would be more than `limit`
 * (an area of a whole country is given up on early instead of being listed).
 */
export function tilesFor(shape: Shape, limit: number): TileId[] | null {
  const [w, s, e, n] = shape.box;
  const out: TileId[] = [];
  for (let z = 0; z <= MAX_ZOOM; z++) {
    const [x0, y0] = tileOf(w, n, z);
    const [x1, y1] = tileOf(e, s, z);
    // an outline fills only a part of its box, but a box this far over the limit cannot fit
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > limit * (shape.type === 'box' ? 1 : 8)) return null;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const id = { z, x, y };
        if (shape.type === 'outline' && !touches(tileBox(id), shape.polygons)) continue;
        out.push(id);
        if (out.length > limit) return null;
      }
    }
  }
  return out;
}
