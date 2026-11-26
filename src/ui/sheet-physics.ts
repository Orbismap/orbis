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

/**
 * Does a touch on the sheet body move the sheet (true) or scroll its content (false)? `dx`/`dy` are the first movement of the
 * finger (px, down = positive), `atTop` says that nothing under the finger is scrolled down. Below the top detent an upward
 * swipe raises the sheet first (as iOS does); a downward pull at the top of the content lowers it; the rest scrolls.
 * It is decided once, at the start: a browser that has begun to scroll no longer lets go of the gesture.
 */
export function claimsGesture(detent: 'peek' | 'half' | 'full', dx: number, dy: number, atTop: boolean): boolean {
  if (detent === 'peek' || Math.abs(dy) < Math.abs(dx)) return false;
  if (dy < 0) return detent !== 'full';
  return atTop;
}

/** Height the on-screen keyboard covers at the bottom of the layout viewport (iOS and Android only shrink the visual one). */
export function keyboardInset(innerHeight: number, view: { height: number; offsetTop: number; scale: number }): number {
  if (view.scale > 1.05) return 0; // pinch zoom, not a keyboard
  const covered = innerHeight - view.height - view.offsetTop;
  return covered > 80 ? Math.round(covered) : 0; // smaller differences are browser bars
}
