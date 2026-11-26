// Pure geodesy and solar helpers. No DOM, no map dependency.
import type { Feature, Polygon } from 'geojson';

export type LngLat = [lng: number, lat: number];
/** West, south, east, north in degrees. */
export type BBox = [w: number, s: number, e: number, n: number];

export const RAD = Math.PI / 180;
export const DEG = 180 / Math.PI;
export const EARTH_RADIUS_KM = 6371.0088;
export const MAX_MERCATOR_LAT = 85.0511287798;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Wraps a longitude into [-180, 180). */
export function wrapLng(lng: number): number {
  const v = ((((lng + 180) % 360) + 360) % 360) - 180;
  return v;
}
/** The longitude in the copy of the world next to `centerLng` (not wrapped to ±180). */
export const lngNear = (lng: number, centerLng: number) => lng + 360 * Math.round((centerLng - lng) / 360);
export const clampLat = (lat: number) => clamp(lat, -90, 90);
export const clampMercatorLat = (lat: number) => clamp(lat, -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT);

/** Great-circle distance in km. */
export function haversine(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b in degrees, 0..360 clockwise from north. */
export function bearing(a: LngLat, b: LngLat): number {
  const p1 = a[1] * RAD;
  const p2 = b[1] * RAD;
  const dl = (b[0] - a[0]) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * DEG + 360) % 360;
}

/** Point reached from `from` after `distanceKm` along `bearingDeg`. */
export function destination(from: LngLat, bearingDeg: number, distanceKm: number): LngLat {
  const d = distanceKm / EARTH_RADIUS_KM;
  const br = bearingDeg * RAD;
  const p1 = from[1] * RAD;
  const l1 = from[0] * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br));
  const l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [wrapLng(l2 * DEG), p2 * DEG];
}

// ---- bounding boxes -------------------------------------------------------

export function bboxOf(points: readonly (readonly number[])[]): BBox | undefined {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of points) {
    const x = p[0], y = p[1];
    if (x === undefined || y === undefined) continue;
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return w === Infinity ? undefined : [w, s, e, n];
}
export const bboxCenter = (b: BBox): LngLat => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
export const bboxContains = (b: BBox, p: LngLat) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
export const bboxIntersects = (a: BBox, b: BBox) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
export const bboxExtend = (b: BBox, p: LngLat): BBox => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])];
export function bboxPad(b: BBox, deg: number): BBox {
  return [b[0] - deg, clampLat(b[1] - deg), b[2] + deg, clampLat(b[3] + deg)];
}
/** bbox of a circle around `c` with radius km (not antimeridian-aware, fine for local queries). */
export function bboxAround(c: LngLat, radiusKm: number): BBox {
  const dLat = (radiusKm / EARTH_RADIUS_KM) * DEG;
  const dLng = dLat / Math.max(0.01, Math.cos(c[1] * RAD));
  return [c[0] - dLng, clampLat(c[1] - dLat), c[0] + dLng, clampLat(c[1] + dLat)];
}

// ---- web mercator (0..1 world coordinates, y down) ------------------------

export function lngLatToMercator(lng: number, lat: number): [x: number, y: number] {
  const l = clampMercatorLat(lat) * RAD;
  return [(lng + 180) / 360, (1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2];
}
export function mercatorToLngLat(x: number, y: number): LngLat {
  return [x * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * DEG];
}

// ---- solar position -------------------------------------------------------

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const norm360 = (d: number) => ((d % 360) + 360) % 360;

interface SunState { dec: number; ra: number; gmst: number } // radians, radians, degrees

function sunState(t: number): SunState {
  const d = (t - J2000_MS) / 86400000;
  const L = 280.46 + 0.9856474 * d;
  const g = (357.528 + 0.9856003 * d) * RAD;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * d) * RAD;
  return {
    ra: Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)),
    dec: Math.asin(Math.sin(eps) * Math.sin(lam)),
    gmst: norm360(280.46061837 + 360.98564736629 * d),
  };
}

/** Sun elevation above the horizon in degrees at the given place and time (ms since epoch). */
export function sunAltitude(lng: number, lat: number, t: number): number {
  const s = sunState(t);
  const h = (s.gmst + lng) * RAD - s.ra;
  const sin = Math.sin(lat * RAD) * Math.sin(s.dec) + Math.cos(lat * RAD) * Math.cos(s.dec) * Math.cos(h);
  return Math.asin(clamp(sin, -1, 1)) * DEG;
}

/** The point where the sun stands in the zenith. */
export function subsolarPoint(t: number): { lng: number; lat: number } {
  const s = sunState(t);
  return { lng: wrapLng(s.ra * DEG - s.gmst), lat: s.dec * DEG };
}

/**
 * Night side as a GeoJSON polygon: everything where the sun is lower than `altitude` degrees
 * (0 = geometric horizon, -6/-12/-18 = civil/nautical/astronomical twilight).
 * Sampled in a fixed longitude range [-180, 180], so no antimeridian crossing exists; the ring closes
 * over the pole that is in darkness.
 */
export function terminatorPolygon(t: number, altitude = 0, step = 2): Feature<Polygon, { altitude: number }> {
  const s = sunState(t);
  let dec = s.dec;
  if (Math.abs(dec) < 1e-6) dec = 1e-6;
  const a = Math.sin(dec);
  const c = Math.sin(altitude * RAD);
  const ring: [number, number][] = [];
  for (let lng = -180; lng <= 180; lng += step) {
    const h = (s.gmst + lng) * RAD - s.ra;
    const b = Math.cos(dec) * Math.cos(h);
    const r = Math.hypot(a, b);
    const delta = Math.atan2(b, a);
    const asin = Math.asin(clamp(c / r, -1, 1));
    const wrapRad = (v: number) => (v > Math.PI ? v - 2 * Math.PI : v <= -Math.PI ? v + 2 * Math.PI : v);
    const p1 = wrapRad(asin - delta);
    const p2 = wrapRad(Math.PI - asin - delta);
    const lat = Math.abs(p1) <= Math.PI / 2 + 1e-9 ? p1 : p2;
    ring.push([lng, clamp(lat * DEG, -90, 90)]);
  }
  const darkPole = dec > 0 ? -90 : 90; // the pole facing away from the sun
  ring.push([180, darkPole], [-180, darkPole], ring[0]!);
  return { type: 'Feature', properties: { altitude }, geometry: { type: 'Polygon', coordinates: [ring] } };
}
