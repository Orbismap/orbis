// Spring and snapping for the bottom Sheet. Pure functions, no DOM.

export interface SpringState { x: number; v: number }

/** Damped spring toward `target` (px, px/s). Slightly under-damped so the sheet settles with a small give. */
export function stepSpring(s: SpringState, target: number, dt: number, stiffness = 380, damping = 34): SpringState {
  // semi-implicit Euler with sub-steps for stability at low frame rates
  const n = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / n;
  let { x, v } = s;
  for (let i = 0; i < n; i++) {
    const a = -stiffness * (x - target) - damping * v;
    v += a * h;
    x += v * h;
  }
  return { x, v };
}

export const settled = (s: SpringState, target: number) => Math.abs(s.x - target) < 0.4 && Math.abs(s.v) < 8;

/**
 * Picks the detent to snap to. `visible` is the current visible height, `velocity` px/s (positive = growing).
 * The projected end position after ~200 ms of momentum decides; a fast flick always moves at least one stop.
 */
export function snapIndex(points: readonly number[], visible: number, velocity: number, from: number): number {
  const projected = visible + velocity * 0.2;
  let best = 0;
  for (let i = 1; i < points.length; i++) if (Math.abs(points[i]! - projected) < Math.abs(points[best]! - projected)) best = i;
  if (Math.abs(velocity) > 900) {
    if (velocity > 0 && best <= from) best = Math.min(points.length - 1, from + 1);
    if (velocity < 0 && best >= from) best = Math.max(0, from - 1);
  }
  return best;
}

/** Rubber band: beyond [min, max] movement is damped. */
export function rubber(v: number, min: number, max: number): number {
  if (v < min) return min - (min - v) * 0.3;
  if (v > max) return max + (v - max) * 0.3;
  return v;
}
