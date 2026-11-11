// Pure helper: centre of a polygon's bounding box (good enough for feed entries and flying to a warning).
import type { Geometry } from 'geojson';
import { bboxCenter, bboxOf, type LngLat } from '../../core/geo';

const flat = (c: unknown, out: number[][]): number[][] => {
  if (Array.isArray(c) && typeof c[0] === 'number') out.push(c as number[]);
  else if (Array.isArray(c)) for (const x of c) flat(x, out);
  return out;
};

export function geometryCenter(g: Geometry | null | undefined): LngLat | undefined {
  if (!g || g.type === 'GeometryCollection') return undefined;
  const b = bboxOf(flat(g.coordinates, []));
  return b ? bboxCenter(b) : undefined;
}
