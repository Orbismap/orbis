// What the camera view shows on top of the picture: the places around as markers, and arrows just behind the junctions where the
// way turns. Pure: positions, the way and the camera in, pixels out.
import { bearing, type LngLat } from '@/core/geo';
import { dot, type Camera, type Vec } from './attitude';
import { progress } from './guide';
import type { Place } from './kinds';
import { metres } from './places';

/** An arrow stands this far behind its junction, in the street one turns into. */
export const BEYOND_M = 9;
/** Less than this change of direction (degrees) is going on straight: no arrow. */
export const TURN_DEG = 28;
/** The direction before and after a junction is measured over this length. */
const LEG_M = 10;
/** This many turns are shown at once, none further than this. */
const TURNS = 2;
const TURN_RANGE_M = 200;
/** Places further away than this are left out (the target never is), and no more than this many are shown. */
const RANGE_M = 300;
const MARKERS = 12;
/** Markers closer to each other than this (px) hide the farther one. */
const APART_X = 52;
const APART_Y = 34;
/**
 * Markers are spread by distance, nearer ones lower: real heights would put them all on one line at the horizon, one hiding the
 * next. Degrees above eye level from the nearest to the farthest distance.
 */
const LOW_DEG = -11;
const HIGH_DEG = 9;
const NEAREST_M = 15;
/** The eye level is kept within this middle share of the view, so that a tilted phone does not lose the markers. */
const LEVEL_FROM = 0.35;
const LEVEL_TO = 0.65;
/** Height of the arrows relative to the eyes, in metres. */
const ARROW_UP = 0.2;
/** The camera of a phone: the angle across the longer side of its picture. Browsers do not tell it. */
export const LONG_SIDE_DEG = 65;
/** Looking further down than this (share of straight down) shows only the ground. */
const DOWN = 0.8;

export interface View { width: number; height: number; /** focal length in px */ focal: number }

/** The focal length in screen pixels of a camera picture that covers the view (like `object-fit: cover`). */
export function focalLength(view: { width: number; height: number }, video: { width: number; height: number }): number {
  const scale = Math.max(view.width / video.width, view.height / video.height);
  return (Math.max(video.width, video.height) / 2 / Math.tan((LONG_SIDE_DEG * Math.PI) / 360)) * scale;
}

/** Metres east and north from one position to another, at a height relative to the eyes. */
export function offsetTo(from: LngLat, to: LngLat, up: number): Vec {
  const away = metres(from, to), b = (bearing(from, to) * Math.PI) / 180;
  return [away * Math.sin(b), away * Math.cos(b), up];
}

/** Where a point appears in the view (may lie outside it), or null when it is behind the camera. */
export function project(point: Vec, camera: Camera, view: View): [x: number, y: number] | null {
  const depth = dot(point, camera.forward);
  if (depth < 0.5) return null;
  return [view.width / 2 + (view.focal * dot(point, camera.right)) / depth, view.height / 2 - (view.focal * dot(point, camera.up)) / depth];
}

// ---- turns --------------------------------------------------------------------------------------------------------------

/** The point `s` metres along a line (its ends beyond them). */
function pointAlong(line: readonly LngLat[], lengths: readonly number[], s: number): LngLat {
  for (let i = 1; i < line.length; i++) {
    if (s > lengths[i]!) continue;
    const a = line[i - 1]!, b = line[i]!, span = lengths[i]! - lengths[i - 1]!;
    const t = span ? Math.max(0, (s - lengths[i - 1]!) / span) : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  return line[line.length - 1]!;
}

/** Metres from the start of a line to each of its points. */
function lengthsOf(line: readonly LngLat[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1]! + metres(line[i - 1]!, line[i]!));
  return out;
}

export interface Turn {
  /** where the arrow stands: behind the junction */
  at: LngLat;
  /** direction of the way there */
  bearing: number;
  /** change of direction at the junction, positive to the right */
  angle: number;
  /** metres along the way to where the arrow stands */
  along: number;
}

/** The junctions of a way where it changes direction. `junctions`: the points of its manoeuvres, in order. */
export function turnsOf(line: readonly LngLat[], junctions: readonly LngLat[]): Turn[] {
  if (line.length < 2) return [];
  const lengths = lengthsOf(line);
  const total = lengths[lengths.length - 1]!;
  const turns: Turn[] = [];
  let from = 0;
  for (const junction of junctions) {
    let best = from;
    for (let i = from + 1; i < line.length; i++) if (metres(line[i]!, junction) < metres(line[best]!, junction)) best = i;
    from = best;
    const s = lengths[best]!;
    if (s <= 0 || s >= total) continue;
    const here = line[best]!;
    const before = bearing(pointAlong(line, lengths, s - LEG_M), here);
    const after = bearing(here, pointAlong(line, lengths, s + LEG_M));
    const angle = ((((after - before) % 360) + 540) % 360) - 180;
    if (Math.abs(angle) < TURN_DEG) continue;
    const along = Math.min(s + BEYOND_M, total);
    turns.push({ at: pointAlong(line, lengths, along), bearing: after, angle, along });
  }
  return turns;
}

/** The next turns ahead of a position; an arrow stays until one has passed it. */
export function turnsAhead(line: readonly LngLat[], junctions: readonly LngLat[], at: LngLat): Turn[] {
  if (line.length < 2) return [];
  const { segment, snapped } = progress(line, at);
  const walked = lengthsOf(line)[segment]! + metres(line[segment]!, snapped);
  return turnsOf(line, junctions).filter((t) => t.along > walked).slice(0, TURNS);
}

/** The corners of an arrow in its own plane, one unit long, pointing along the first axis. */
const ARROW: [along: number, up: number][] = [[-0.5, -0.17], [0.02, -0.17], [0.02, -0.4], [0.5, 0], [0.02, 0.4], [0.02, 0.17], [-0.5, 0.17]];

/**
 * An upright arrow at the turn, pointing along the way: seen from before the junction it points to the side one turns to. It
 * grows with the distance so that a far one can still be read.
 */
function arrowShape(from: LngLat, turn: Turn, camera: Camera, view: View): [number, number][] | null {
  const centre = offsetTo(from, turn.at, ARROW_UP);
  const away = Math.hypot(centre[0], centre[1]);
  if (away < 3 || away > TURN_RANGE_M) return null;
  const size = Math.min(14, Math.max(2.2, away * 0.16));
  const b = (turn.bearing * Math.PI) / 180;
  const points: [number, number][] = [];
  for (const [along, up] of ARROW) {
    const p = project([centre[0] + Math.sin(b) * along * size, centre[1] + Math.cos(b) * along * size, centre[2] + up * size], camera, view);
    if (!p) return null;
    points.push(p);
  }
  return points;
}

// ---- the scene ----------------------------------------------------------------------------------------------------------

/** The height (metres relative to the eyes) at which a marker so far away is drawn. */
function markerUp(distance: number): number {
  const share = Math.min(1, Math.max(0, Math.log(distance / NEAREST_M) / Math.log(RANGE_M / NEAREST_M)));
  return distance * Math.tan(((LOW_DEG + (HIGH_DEG - LOW_DEG) * share) * Math.PI) / 180);
}

/** How far all markers move up or down (px) so that the eye level stays near the middle. */
function levelShift(camera: Camera, view: View): number {
  const flat = Math.hypot(camera.forward[0], camera.forward[1]) || 1;
  const level = project([(camera.forward[0] / flat) * 100, (camera.forward[1] / flat) * 100, 0], camera, view);
  if (!level) return 0;
  return Math.min(view.height * LEVEL_TO, Math.max(view.height * LEVEL_FROM, level[1])) - level[1];
}

export interface Marker { place: Place; x: number; y: number; distance: number; target: boolean }
export interface Arrow { points: [number, number][]; next: boolean }
export interface Scene {
  markers: Marker[];
  arrows: Arrow[];
  /** to which side the next thing to head for lies when it is out of view */
  aside: 'left' | 'right' | null;
  /** the camera looks at the ground */
  down: boolean;
}

export interface SceneInput {
  at: LngLat;
  camera: Camera;
  view: View;
  places: readonly Place[];
  target: Place | null;
  /** the way to the target, empty without one */
  line: readonly LngLat[];
  junctions: readonly LngLat[];
  /** one is at the target: its marker would only point somewhere random */
  there: boolean;
}

export function scene({ at, camera, view, places, target, line, junctions, there }: SceneInput): Scene {
  if (camera.forward[2] < -DOWN) return { markers: [], arrows: [], aside: null, down: true };
  // height is kept inside the view: the direction matters, and a phone tilted a little would lose everything otherwise
  const inside = (y: number, margin: number) => Math.min(view.height - margin, Math.max(margin, y));

  const turns = there ? [] : turnsAhead(line, junctions, at);
  const arrows: Arrow[] = [];
  turns.forEach((turn, i) => {
    const points = arrowShape(at, turn, camera, view);
    if (!points) return;
    const middle = points.reduce((sum, p) => sum + p[1], 0) / points.length;
    const shift = inside(middle, 76) - middle;
    arrows.push({ points: points.map(([x, y]) => [x, y + shift]), next: i === 0 });
  });

  const all = target && !places.some((p) => p.key === target.key) ? [...places, target] : places;
  const near = all
    .map((place) => ({ place, distance: metres(at, [place.lng, place.lat]), target: place.key === target?.key }))
    .filter((m) => (m.target ? !there : m.distance <= RANGE_M))
    .sort((a, b) => Number(b.target) - Number(a.target) || a.distance - b.distance);
  const shift = levelShift(camera, view);
  const markers: Marker[] = [];
  for (const m of near) {
    if (markers.length >= MARKERS) break;
    const p = project(offsetTo(at, [m.place.lng, m.place.lat], markerUp(m.distance)), camera, view);
    if (!p || p[0] < 0 || p[0] > view.width) continue;
    const x = p[0], y = inside(p[1] + shift, 30);
    if (markers.some((o) => Math.abs(o.x - x) < APART_X && Math.abs(o.y - y) < APART_Y)) continue;
    markers.push({ ...m, x, y });
  }

  // the next turn comes before the target
  const next = turns[0]?.at ?? (target && !there ? ([target.lng, target.lat] as LngLat) : undefined);
  let aside: Scene['aside'] = null;
  if (next) {
    const point = offsetTo(at, next, 0);
    const p = project(point, camera, view);
    if (!p || p[0] < 0 || p[0] > view.width) aside = dot(point, camera.right) < 0 ? 'left' : 'right';
  }
  return { markers, arrows, aside, down: false };
}
