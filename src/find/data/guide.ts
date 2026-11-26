// The arithmetic of the guide, free of the browser: which place to head for, where along the route to point, and how the
// arrow turns.
import { bearing, type LngLat } from '@/core/geo';
import type { Place } from './kinds';
import { metres } from './places';

/** A nearer place only takes over if it is this much nearer: positions jitter, the arrow should not flip between neighbours. */
export const SWITCH_M = 25;
/** The arrow points this far ahead along the route. */
export const LOOK_AHEAD_M = 25;
/** This close to the place the arrow points straight at it (the last metres are rarely on a road). */
export const DIRECT_M = 35;
/** Further than this from the route: a new one is needed. */
export const OFF_ROUTE_M = 40;
/** Further than this the old route says nothing any more. */
const LOST_M = 150;
/** Within this distance one is at the place; a poor position widens it up to the second value. */
const THERE_M = 12;
const THERE_MAX_M = 25;

export const isThere = (distance: number, accuracy: number): boolean => distance <= Math.max(THERE_M, Math.min(accuracy, THERE_MAX_M));

export function pickTarget(places: readonly Place[], at: LngLat, current: Place | null): Place | null {
  let best: Place | null = null;
  let bestM = Infinity;
  for (const p of places) {
    const d = metres(at, [p.lng, p.lat]);
    if (d < bestM) (best = p, (bestM = d));
  }
  const kept = current && places.find((p) => p.key === current.key);
  return kept && metres(at, [kept.lng, kept.lat]) <= bestM + SWITCH_M ? kept : best;
}

export interface Progress {
  /** metres from the position to the line */
  off: number;
  /** index of the segment the position is next to */
  segment: number;
  /** the nearest point of the line */
  snapped: LngLat;
  /** the point `ahead` metres further along the line (its end at most) */
  aim: LngLat;
  /** metres along the line from `snapped` to its end */
  remaining: number;
}

export function progress(line: readonly LngLat[], at: LngLat, ahead = LOOK_AHEAD_M): Progress {
  // flat coordinates around the position, good for the few kilometres of a route to the next stand
  const k = Math.cos((at[1] * Math.PI) / 180);
  let off = Infinity, segment = 0;
  let snapped: LngLat = line[0]!;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!, b = line[i + 1]!;
    const ax = (a[0] - at[0]) * k, ay = a[1] - at[1];
    const dx = (b[0] - a[0]) * k, dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const t = len ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len)) : 0;
    const p: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = metres(at, p);
    if (d < off) (off = d, (segment = i), (snapped = p));
  }
  if (line.length < 2) off = metres(at, snapped);
  let aim = snapped;
  let remaining = 0;
  let from = snapped;
  for (let i = segment + 1; i < line.length; i++) {
    const to = line[i]!;
    const d = metres(from, to);
    if (remaining < ahead) {
      const t = d ? Math.min(1, (ahead - remaining) / d) : 1;
      aim = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    }
    remaining += d;
    from = to;
  }
  return { off, segment, snapped, aim, remaining };
}

export interface Heading {
  /** degrees clockwise from north in which to go */
  bearing: number;
  /** metres still to go: along the route where there is one, else as the crow flies */
  distance: number;
  /** the route still ahead, from the position to the place (empty without a usable route) */
  ahead: LngLat[];
}

/** Where to go from `at` to reach `target`, following `route` when it is usable. */
export function guide(at: LngLat, target: LngLat, route: readonly LngLat[] | null): Heading {
  const air = metres(at, target);
  const direct: Heading = { bearing: bearing(at, target), distance: air, ahead: [] };
  if (!route || route.length < 2) return direct;
  const p = progress(route, at);
  if (p.off > LOST_M) return direct;
  const end = route[route.length - 1]!;
  const ahead = [at, p.snapped, ...route.slice(p.segment + 1), target];
  const distance = p.off + p.remaining + metres(end, target);
  const close = air <= DIRECT_M || p.remaining <= LOOK_AHEAD_M / 2;
  return { bearing: close ? direct.bearing : bearing(at, p.aim), distance: close ? air : distance, ahead };
}

/** The angle equal to `next` (mod 360) that lies closest to `previous`, so that a rotation never takes the long way round. */
export const unwrap = (previous: number, next: number): number => previous + ((((next - previous) % 360) + 540) % 360) - 180;
