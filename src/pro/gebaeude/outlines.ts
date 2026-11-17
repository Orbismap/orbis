import type { BuildingSample } from '../../ext/types';

// A building that is split into `building:part`s must not be drawn as a whole as well: its outline, a prism of the full height,
// would hide the parts (their roofs, their set-back walls). So an outline is left out when a part lies inside it.

type P = [number, number];
type Box = [number, number, number, number];

const boxOf = (r: P[]): Box => r.reduce<Box>((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);

const inRing = (x: number, y: number, ring: P[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inShape = (x: number, y: number, rings: P[][]): boolean => inRing(x, y, rings[0]!) && !rings.slice(1).some((h) => inRing(x, y, h));

/** A point that lies inside the part: its centre of gravity, or when the part is bent so that it lies outside, a point just inside its first corner. */
function probe(rings: P[][]): P {
  const r = rings[0]!;
  const n = r.length - (r.length > 1 && r[0]![0] === r[r.length - 1]![0] && r[0]![1] === r[r.length - 1]![1] ? 1 : 0);
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += r[i]![0]; cy += r[i]![1]; }
  const c: P = [cx / n, cy / n];
  if (inShape(c[0], c[1], rings)) return c;
  for (const k of [0.15, 0.4]) {
    for (let i = 0; i < n; i++) {
      const p: P = [r[i]![0] + (c[0] - r[i]![0]) * k, r[i]![1] + (c[1] - r[i]![1]) * k];
      if (inShape(p[0], p[1], rings)) return p;
    }
  }
  return r[0]!;
}

/** The samples to draw: all parts, and the buildings that have no part inside them. */
export function withoutSplitOutlines(items: readonly BuildingSample[]): BuildingSample[] {
  const probes = items.filter((b) => b.part && b.rings[0]?.length).map((b) => probe(b.rings as P[][]));
  if (!probes.length) return items.slice();
  return items.filter((b) => {
    if (b.part || !b.rings[0]?.length) return true;
    const rings = b.rings as P[][];
    const box = boxOf(rings[0]!);
    return !probes.some(([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3] && inShape(x, y, rings));
  });
}
