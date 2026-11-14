import { EARTH_RADIUS_M, type Vec3 } from '../world3d/frame';

// The geometry of a camera that keeps an object in the middle of the screen. Ported from the old app's focus.ts.
//
// MapLibre only turns around a point on the ground, so the map centre is put where the line of sight through the
// object meets the ground. The flat camera can do better (it has a centre elevation, see follow.ts), the globe
// camera ignores that. During the blend between the two both are mixed like the map itself.

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * The place from which, looking along `bearing` (degrees from north, as measured there), lon / lat lies
 * `angle` radians straight behind. A compass direction changes along a great circle, so simply going
 * that way from lon / lat would miss it.
 */
export function placeAhead(lon: number, lat: number, bearing: number, angle: number): [number, number] {
  const sinP = Math.sin(rad(lat));
  // sin(lat) = sin(x) cos(angle) - cos(x) sin(angle) cos(bearing), solved for the latitude x
  const a = Math.cos(angle);
  const b = -Math.sin(angle) * Math.cos(rad(bearing));
  // close to the pole there is no such place: as near as it gets
  const x = Math.asin(Math.max(-1, Math.min(1, sinP / Math.hypot(a, b)))) - Math.atan2(b, a);
  const dLon = Math.atan2(-Math.sin(rad(bearing)) * Math.sin(angle) * Math.cos(x), Math.cos(angle) - Math.sin(x) * sinP);
  return [lon - deg(dLon), deg(x)];
}

/** Way from the ground point to the object along the line of sight, in earth radii. */
export function sightToObject(altM: number, pitch: number): number {
  const r = 1 + altM / EARTH_RADIUS_M;
  const c = Math.cos(rad(pitch));
  return -c + Math.sqrt(c * c + r * r - 1);
}

/** Map centre that puts the object in the middle of the screen; `t`: how much of a globe the map is (1 globe, 0 flat). */
export function focusCentre(p: Vec3, bearing: number, pitch: number, t: number): [number, number] {
  const s = sightToObject(p[2], pitch);
  const a = rad(pitch);
  // the object is seen from the camera's side of the centre, so the centre is further ahead
  const angle = Math.atan2(s * Math.sin(a), 1 + s * Math.cos(a));
  return placeAhead(p[0], p[1], bearing, angle * t);
}

/** Between two places along the great circle. */
export function slerp(a: [number, number], b: [number, number], k: number): [number, number] {
  const v = (p: [number, number]) => [Math.cos(rad(p[1])) * Math.cos(rad(p[0])), Math.cos(rad(p[1])) * Math.sin(rad(p[0])), Math.sin(rad(p[1]))] as const;
  const [p, q] = [v(a), v(b)];
  const d = Math.acos(Math.min(1, Math.max(-1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2])));
  if (d < 1e-9) return b;
  const [k1, k2] = [Math.sin((1 - k) * d) / Math.sin(d), Math.sin(k * d) / Math.sin(d)];
  const [x, y, z] = [k1 * p[0] + k2 * q[0], k1 * p[1] + k2 * q[1], k1 * p[2] + k2 * q[2]];
  return [deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.hypot(x, y)))];
}
