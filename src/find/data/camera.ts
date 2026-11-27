// The camera of the map, like a navigation app: it stays on the own position and turns so that "ahead" is up.
import type { LngLat } from '@/core/geo';
import { unwrap } from './guide';

export const NAV_ZOOM = 18;
export const NAV_PITCH = 60;
/** The own position lies this far below the middle of the map (share of its height), to show more of what is ahead. */
export const BELOW_MIDDLE = 0.2;
/** This close to the end the direction of the route says nothing any more: the view stays as it is. */
const HOLD_M = 8;
/** The time in which the camera covers about two thirds of what is left to its goal. */
const EASE_MS = 180;

export interface View { center: LngLat; zoom: number; pitch: number; bearing: number }

/**
 * What is up on the map: with a compass where the person looks; without one where the route leads; without a route the way
 * travelled; else it stays.
 */
export function bearingFor({ compass, heading, way, previous }: {
  compass: boolean; heading: number | null; way: { bearing: number; distance: number } | null; previous: number;
}): number {
  if (compass && heading !== null) return heading;
  if (way) return way.distance > HOLD_M ? way.bearing : previous;
  return heading ?? previous;
}

/** One frame of `dt` ms from `from` towards `to`, turning the short way round. `done`: it has arrived. */
export function approach(from: View, to: View, dt: number): { view: View; done: boolean } {
  const bearing = unwrap(from.bearing, to.bearing);
  const near = Math.abs(to.center[0] - from.center[0]) < 2e-6 && Math.abs(to.center[1] - from.center[1]) < 2e-6
    && Math.abs(to.zoom - from.zoom) < 0.01 && Math.abs(to.pitch - from.pitch) < 0.2 && Math.abs(bearing - from.bearing) < 0.3;
  if (near) return { view: { ...to, bearing }, done: true };
  const share = 1 - Math.exp(-dt / EASE_MS);
  const mix = (a: number, b: number) => a + (b - a) * share;
  return {
    view: {
      center: [mix(from.center[0], to.center[0]), mix(from.center[1], to.center[1])],
      zoom: mix(from.zoom, to.zoom), pitch: mix(from.pitch, to.pitch), bearing: mix(from.bearing, bearing),
    },
    done: false,
  };
}
