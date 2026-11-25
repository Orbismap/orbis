// Circular-orbit propagation for the replay mode: position of an object in a (slowly precessing) circular orbit as
// longitude / latitude over the rotating Earth. Pure, no DOM. The model is deliberately simple (two-body plus the J2
// drift of the node, which is what moves the ground track by ~700 km over a day in low orbit) but it is the real mechanics,
// so a day in orbit has the right number of passes and the right ground-track shift per revolution.
import { DEG, RAD, wrapLng, type LngLat } from '../core/geo';

export const MU = 398600.4418; // km^3/s^2
export const EARTH_RADIUS_EQ_KM = 6378.137;
export const J2 = 1.08263e-3;
/** rotation rate of the Earth, rad/s */
export const EARTH_ROT = 7.2921159e-5;

export interface CircularOrbit {
  /** orbit radius in km (Earth radius + altitude) */
  a: number;
  /** inclination, radians */
  inc: number;
  /** right ascension of the ascending node at `t0`, radians (inertial frame, x axis = Greenwich at t = 0) */
  raan0: number;
  /** argument of latitude at `t0`, radians */
  u0: number;
  /** epoch of the elements, seconds after T-0 */
  t0: number;
}

/** orbital period in seconds */
export const periodOf = (a: number) => 2 * Math.PI * Math.sqrt((a * a * a) / MU);
/** mean motion, rad/s */
export const meanMotion = (a: number) => Math.sqrt(MU / (a * a * a));
/** drift of the node, rad/s (negative: westwards for prograde orbits) */
export const nodeDrift = (a: number, inc: number) => (-1.5 * J2 * (EARTH_RADIUS_EQ_KM / a) ** 2 * meanMotion(a) * Math.cos(inc));

/**
 * The orbit that passes through (lng, lat) at time `t` moving north-east (ascending) or south-east (descending).
 * `t` is seconds after T-0; the Earth's rotation angle at T-0 is taken as 0 (only differences matter).
 */
export function orbitThrough(lng: number, lat: number, t: number, altKm: number, incDeg: number, ascending = true): CircularOrbit {
  const inc = incDeg * RAD;
  const s = Math.min(1, Math.max(-1, Math.sin(lat * RAD) / Math.sin(inc)));
  // argument of latitude: ascending in (-90, 90), descending in (90, 270)
  const u = ascending ? Math.asin(s) : Math.PI - Math.asin(s);
  const lngInertial = lng * RAD + EARTH_ROT * t;
  const raan = lngInertial - Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u));
  return { a: EARTH_RADIUS_EQ_KM + altKm, inc, raan0: raan, u0: u, t0: t };
}

/** Longitude / latitude (degrees) of the object at `t` seconds after T-0. */
export const orbitPosition = (o: CircularOrbit, t: number): LngLat => orbitPositionAt(o, o.u0 + meanMotion(o.a) * (t - o.t0), t);

/** Like `orbitPosition`, but the argument of latitude `u` (radians) is given: for a body that does not move at a constant rate along its plane (a sub-orbital arc, a burn). */
export function orbitPositionAt(o: CircularOrbit, u: number, t: number): LngLat {
  const dt = t - o.t0;
  const raan = o.raan0 + nodeDrift(o.a, o.inc) * dt;
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const ci = Math.cos(o.inc);
  const x = Math.cos(raan) * cu - Math.sin(raan) * su * ci;
  const y = Math.sin(raan) * cu + Math.cos(raan) * su * ci;
  const z = su * Math.sin(o.inc);
  const lng = Math.atan2(y, x) - EARTH_ROT * t;
  return [wrapLng(lng * DEG), Math.asin(Math.max(-1, Math.min(1, z))) * DEG];
}

/** Orbital speed in km/s. */
export const orbitalSpeed = (a: number) => Math.sqrt(MU / a);
