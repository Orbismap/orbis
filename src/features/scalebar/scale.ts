// Scale bar maths, ported from the old Orbis (src/scalebar.ts): "nice number" steps, at most three segments.
export const MAX_PX = 170;
/** labels need room: a segment is at least this wide */
const MIN_SEG_PX = 32;
const EARTH_RADIUS_M = 6371008.8;

export interface ScaleUnit { big: [label: string, metres: number]; small: [label: string, metres: number] }
export const SCALE_UNITS: Record<'km' | 'mi', ScaleUnit> = {
  km: { big: ['km', 1000], small: ['m', 1] },
  mi: { big: ['mi', 1609.344], small: ['ft', 0.3048] },
};

/** ground distance in metres between two points on a sphere */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }, r = EARTH_RADIUS_M): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** [segment length, segment count] per decade, at most 3 segments:
 *  (0 5 10) (0 5 10 15) (0 12,5) (0 12,5 25) (0 12,5 25 37,5) (0 25 50) (0 25 50 75) (0 50 100) (0 50 100 150), then ×10 … */
const STEPS: [number, number][] = [[5, 2], [5, 3], [12.5, 1], [12.5, 2], [12.5, 3], [25, 2], [25, 3], [50, 2], [50, 3]];
const DECADES = [0.001, 0.01, 0.1, 1, 10];

/** a single 12,5-segment only shows up after the 15 step, so it enters later than its length says */
const enter = (total: number, n: number) => (n === 1 ? total * 1.6 : total);

/** The step (in the unit) that is due at `maxUnits`, with room for the labels. */
export function fit(maxUnits: number): { seg: number; n: number } {
  const pow = 10 ** Math.floor(Math.log10(maxUnits));
  let best = { seg: 0, n: 1 };
  let bestAt = 0;
  for (const d of DECADES)
    for (const [m, n] of STEPS) {
      const seg = m * pow * d;
      const at = enter(seg * n, n);
      if (at <= maxUnits && (seg / maxUnits) * MAX_PX >= MIN_SEG_PX && at > bestAt) (best = { seg, n }), (bestAt = at);
    }
  if (!best.seg) {
    // no step has room for its labels: take the widest one that fits anyway
    for (const d of DECADES) for (const [m, n] of STEPS) if (m * pow * d * n <= maxUnits && m * pow * d * n > best.seg * best.n) best = { seg: m * pow * d, n };
  }
  return best;
}

export interface ScaleModel { seg: number; n: number; label: string; width: number; zoom: number }

/** Model for `meters` of ground under MAX_PX pixels. */
export function scaleModel(meters: number, unit: ScaleUnit, zoom: number): ScaleModel | null {
  if (!Number.isFinite(meters) || meters <= 0) return null;
  const [label, perUnit] = meters >= unit.big[1] ? unit.big : unit.small;
  const { seg, n } = fit(meters / perUnit);
  if (!seg) return null;
  return { seg, n, label, width: ((seg * n * perUnit) / meters) * MAX_PX, zoom };
}
