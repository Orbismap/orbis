// How the device is held, from its orientation events: where the back camera looks, and which way one is heading. World axes
// are east, north and up. Pure.

export type Vec = [east: number, north: number, up: number];

/** The three directions of the camera as the screen shows them. */
export interface Camera { right: Vec; up: Vec; forward: Vec }

export interface OrientationReading {
  alpha?: number | null;
  beta?: number | null;
  gamma?: number | null;
  absolute?: boolean;
  /** iOS only: the compass heading of the top of the device */
  webkitCompassHeading?: number;
  /** iOS only: by how many degrees that heading may be off; negative: the compass cannot tell */
  webkitCompassAccuracy?: number;
}

/** From this many degrees of possible error on the compass is called inaccurate. */
const POOR_DEG = 25;
export const isPoor = (accuracy: number | null): boolean => accuracy !== null && (accuracy < 0 || accuracy > POOR_DEG);

const NAMES = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'];
/** "Nordosten" for degrees clockwise from north, also beyond one turn. */
export const directionName = (degrees: number): string => NAMES[((Math.round(degrees / 45) % 8) + 8) % 8]!;

const RAD = Math.PI / 180;
/** iOS: up to this tilt (degrees) the compass heading is trusted to find north anew. */
const LEVEL_BETA = 60;
const LEVEL_GAMMA = 45;

export const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: Vec): Vec => {
  const length = Math.hypot(...v) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

/**
 * The camera for the angles of a device orientation event, `alpha` counted from north. `screen`: how far the screen is turned
 * against the device (0 upright, 90 or 270 on its side).
 */
export function cameraFromAngles(alpha: number, beta: number, gamma: number, screen = 0): Camera {
  const cz = Math.cos(alpha * RAD), sz = Math.sin(alpha * RAD);
  const cx = Math.cos(beta * RAD), sx = Math.sin(beta * RAD);
  const cy = Math.cos(gamma * RAD), sy = Math.sin(gamma * RAD);
  // the rotation device → world of the specification (Z-X'-Y''), by its columns: the device's x, y and z axis
  const x: Vec = [cz * cy - sz * sx * sy, sz * cy + cz * sx * sy, -cx * sy];
  const y: Vec = [-sz * cx, cz * cx, sx];
  const z: Vec = [cz * sy + sz * sx * cy, sz * sy - cz * sx * cy, cx * cy];
  const c = Math.cos(screen * RAD), s = Math.sin(screen * RAD);
  const mix = (a: number, b: number): Vec => [a * x[0] + b * y[0], a * x[1] + b * y[1], a * x[2] + b * y[2]];
  return { right: mix(c, -s), up: mix(s, c), forward: [-z[0], -z[1], -z[2]] };
}

/**
 * Degrees clockwise from north one is heading: lying flat the top of the screen says so, held upright the camera does. Their sum
 * holds for every tilt in between.
 */
export function headingOf(camera: Camera): number {
  const east = camera.up[0] + camera.forward[0], north = camera.up[1] + camera.forward[1];
  return (Math.atan2(east, north) / RAD + 360) % 360;
}

/** Takes over a share of a new reading, to calm the picture. */
export function blend(previous: Camera | null, next: Camera, share: number): Camera {
  if (!previous) return next;
  const mix = (a: Vec, b: Vec): Vec => [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share, a[2] + (b[2] - a[2]) * share];
  const forward = unit(mix(previous.forward, next.forward));
  const rough = mix(previous.up, next.up);
  const along = dot(rough, forward);
  const up = unit([rough[0] - along * forward[0], rough[1] - along * forward[1], rough[2] - along * forward[2]]);
  return { right: cross(forward, up), up, forward };
}

/**
 * The `alpha` of a reading counted from north, or null when the reading says nothing about north. iOS counts alpha from wherever
 * it started and names the compass heading beside it: their difference (`offset`) is renewed while the device is level enough for
 * the compass to be right, and carried while it is held up. Only a level reading is kept: one taken while the device is held up
 * serves for the moment, but may be half a turn off.
 */
export function fromNorth(e: OrientationReading, offset: number | null): { alpha: number; offset: number | null } | null {
  if (typeof e.alpha !== 'number') return null;
  if (typeof e.webkitCompassHeading !== 'number') return e.absolute ? { alpha: e.alpha, offset } : null;
  const level = Math.abs(e.beta ?? 0) < LEVEL_BETA && Math.abs(e.gamma ?? 0) < LEVEL_GAMMA;
  const found = 360 - e.webkitCompassHeading - e.alpha;
  if (offset === null) return { alpha: e.alpha + found, offset: level ? found : null };
  const next = level ? offset + ((((found - offset) % 360) + 540) % 360 - 180) * 0.2 : offset;
  return { alpha: e.alpha + next, offset: next };
}
