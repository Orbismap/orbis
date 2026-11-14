import { EARTH_RADIUS_M, type Vec3 } from './frame';

// The geometry of a camera that keeps an object in the middle of the screen. Ported from the old app's focus.ts.
//
// MapLibre only turns around a point on the ground, so the map centre is put where the line of sight through the
// object meets the ground, and the centre elevation stays 0. (The flat camera could use its centre elevation, the
// globe camera ignores it: the two would then need different zooms for the same distance, and as the zoom decides
// how much of a globe the map is, there is a zoom at which no state is consistent: the camera flips between them.)
// The ground point is found on the sphere for the globe and in the plane for the flat map; they differ by a few
// metres. During the blend both are mixed like the map itself mixes the two cameras.

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

/** The same on the flat map (Mercator): the ground point is alt * tan(pitch) ahead in the plane. */
function planarAhead(lon: number, lat: number, bearing: number, altM: number, pitch: number): [number, number] {
  const d = (altM * Math.tan(rad(pitch))) / (EARTH_RADIUS_M * Math.cos(rad(Math.min(MAX_CENTRE_LAT, Math.abs(lat)))));
  const y = Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2)) + d * Math.cos(rad(bearing));
  return [lon + deg(d * Math.sin(rad(bearing))), deg(2 * Math.atan(Math.exp(y)) - Math.PI / 2)];
}

/** Map centre that puts the object in the middle of the screen; `t`: how much of a globe the map is (1 globe, 0 flat). */
export function focusCentre(p: Vec3, bearing: number, pitch: number, t: number): [number, number] {
  const s = sightToObject(p[2], pitch);
  const a = rad(pitch);
  // the object is seen from the camera's side of the centre, so the centre is further ahead
  const angle = Math.atan2(s * Math.sin(a), 1 + s * Math.cos(a));
  const globe = placeAhead(p[0], p[1], bearing, angle);
  if (t >= 1) return globe;
  // between: the mix of both, so that the mix of the two cameras is centred on the object as well
  const flat = planarAhead(p[0], p[1], bearing, p[2], pitch);
  const dLon = ((flat[0] - globe[0] + 540) % 360) - 180;
  return [globe[0] + dLon * (1 - t), globe[1] + (flat[1] - globe[1]) * (1 - t)];
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

// The camera's distance to the object is what counts for the user: it stays when tilting. MapLibre only has the
// distance to the map centre (its zoom), which lies further away behind the object the flatter the view. So the
// zoom kept while following is that of the distance to the object, and the map's zoom follows from it. Both are
// independent of latitude: the zoom of the map is this plus log2(cos lat). `t`: how much of a globe the map is.

const MIN_GAP_RADII = 0.1;
const MIN_GAP_SHARE = 0.3;
const MAX_CENTRE_LAT = 85;

/** Camera distance in earth radii at zoom 0; `toCentre`: the camera's distance to the map centre in pixels. */
const distanceAtZoom0 = (toCentre: number) => (toCentre * 2 * Math.PI) / 512;

export const latScale = (lat: number) => Math.log2(Math.cos(rad(Math.max(-MAX_CENTRE_LAT, Math.min(MAX_CENTRE_LAT, lat)))));

/** The map's zoom for a zoom of the distance to the object. */
export function mapZoomFor(distanceZoom: number, altM: number, pitch: number, t: number, toCentre: number): number {
  const k = distanceAtZoom0(toCentre);
  return Math.log2(k / (k / 2 ** distanceZoom + sightToObject(altM, pitch) * t));
}

/** The zoom of the distance to the object for a map's zoom. */
export function distanceZoomFor(mapZoom: number, altM: number, pitch: number, t: number, toCentre: number): number {
  const k = distanceAtZoom0(toCentre);
  return Math.log2(k / Math.max(1e-9, k / 2 ** mapZoom - sightToObject(altM, pitch) * t));
}

/** The nearest the camera may get on the globe, as a zoom of the distance; the same from every side. */
export function maxDistanceZoom(altM: number, toCentre: number): number {
  const gap = Math.min(MIN_GAP_RADII, (altM / EARTH_RADIUS_M) * MIN_GAP_SHARE);
  return gap > 0 ? Math.log2(distanceAtZoom0(toCentre) / gap) : Infinity;
}

/** The nearest the camera may get: where the map reaches its maximum zoom, but never nearer than `maxDistanceZoom` (else far too many tiles load). */
export function highestDistanceZoom(maxMapZoom: number, altM: number, pitch: number, t: number, toCentre: number): number {
  return Math.min(distanceZoomFor(maxMapZoom, altM, pitch, t, toCentre), maxDistanceZoom(altM, toCentre));
}

// How much of a globe the map is depends on the map's zoom alone. MapLibre's "globe" projection is the style
// expression ["interpolate", ["linear"], ["zoom"], 11, "vertical-perspective", 12, "mercator"]
// (maplibre-gl, createProjectionFromName: case "globe"), evaluated with the transform's zoom at every frame.
// The shader mixes the clip positions of the flat and the globe camera by this value (interpolateProjection).
const GLOBE_FULL_ZOOM = 11;
const GLOBE_GONE_ZOOM = 12;

/** `t` at a map zoom: 1 on the globe (zoom 11 and below), 0 flat (12 and above), linear between. */
export function globeness(zoom: number): number {
  return 1 - Math.max(0, Math.min(1, (zoom - GLOBE_FULL_ZOOM) / (GLOBE_GONE_ZOOM - GLOBE_FULL_ZOOM)));
}

/**
 * The map camera for a zoom of the distance to the object: centre, zoom and `t` (how much of a globe MapLibre draws at
 * that zoom). The zoom itself does not depend on `t` (centre on the ground, see the top); only the centre does, by a few
 * metres, and its latitude moves the zoom by a hair: two rounds settle that. Nothing is read back from a drawn frame.
 */
export function solveCamera(p: Vec3, bearing: number, pitch: number, distanceZoom: number, toCentre: number, centreOf: (t: number) => [number, number] = (t) => focusCentre(p, bearing, pitch, t)): { centre: [number, number]; zoom: number; t: number } {
  const base = mapZoomFor(distanceZoom, p[2], pitch, 1, toCentre);
  let t = globeness(base + latScale(p[1]));
  let centre = centreOf(t);
  let zoom = base + latScale(centre[1]);
  for (let i = 0; i < 2; i++) {
    t = globeness(zoom);
    centre = centreOf(t);
    zoom = base + latScale(centre[1]);
  }
  return { centre, zoom, t: globeness(zoom) };
}
