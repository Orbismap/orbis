// Hit tests on the screen (CSS px) for things the map cannot pick: the stage projects their shapes itself.

export type Point = [number, number];

/** Distance from (x, y) to the segment a-b. */
export function segmentDistance(x: number, y: number, a: Point, b: Point): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = dx || dy ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

/** Is (x, y) inside the triangle a-b-c (either winding, edges count)? */
export function inTriangle(x: number, y: number, a: Point, b: Point, c: Point): boolean {
  const side = (p: Point, q: Point) => (x - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (y - q[1]);
  const [d1, d2, d3] = [side(a, b), side(b, c), side(c, a)];
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** Is (x, y) inside the quad a-b-c-d (corners in order around it)? */
export function inQuad(x: number, y: number, a: Point, b: Point, c: Point, d: Point): boolean {
  return inTriangle(x, y, a, b, c) || inTriangle(x, y, a, c, d);
}
