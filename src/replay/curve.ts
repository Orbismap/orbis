// Smooth curves through keyframes for the modelled flights: monotone cubic (Fritsch–Carlson), so a rising altitude never
// overshoots between two keys and a speed profile has no kinks. Pure.

export type Keys = readonly (readonly [t: number, v: number])[];

/** A function t → value through `keys` (sorted by t), clamped to the first / last value outside. */
export function curve(keys: Keys): (t: number) => number {
  const n = keys.length;
  if (n === 0) return () => 0;
  if (n === 1) return () => keys[0]![1];
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(keys[i + 1]![0] - keys[i]![0]);
    slope.push((keys[i + 1]![1] - keys[i]![1]) / dx[i]!);
  }
  const m: number[] = new Array(n).fill(0);
  m[0] = slope[0]!;
  m[n - 1] = slope[n - 2]!;
  for (let i = 1; i < n - 1; i++) m[i] = slope[i - 1]! * slope[i]! <= 0 ? 0 : (slope[i - 1]! + slope[i]!) / 2;
  // keep the tangents inside the monotone region
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i]! / slope[i]!;
    const b = m[i + 1]! / slope[i]!;
    const h = Math.hypot(a, b);
    if (h > 3) { const k = 3 / h; m[i] = k * a * slope[i]!; m[i + 1] = k * b * slope[i]!; }
  }
  return (t: number) => {
    if (t <= keys[0]![0]) return keys[0]![1];
    if (t >= keys[n - 1]![0]) return keys[n - 1]![1];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (keys[mid]![0] <= t) lo = mid; else hi = mid; }
    const h = dx[lo]!;
    const s = (t - keys[lo]![0]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * keys[lo]![1] + (s3 - 2 * s2 + s) * h * m[lo]! + (-2 * s3 + 3 * s2) * keys[lo + 1]![1] + (s3 - s2) * h * m[lo + 1]!;
  };
}

/** Linear 0..1 position of `t` between a and b, clamped. */
export const ramp = (t: number, a: number, b: number) => (b === a ? (t >= b ? 1 : 0) : Math.min(1, Math.max(0, (t - a) / (b - a))));

/** Shortest-way blend of two compass headings. */
export function lerpHeading(a: number, b: number, k: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (a + d * k + 360) % 360;
}
