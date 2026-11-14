import type { GeoFrame, Vec3 } from '../world3d/frame';
import { GeoLine } from '../world3d/line';
import { GeoWall } from '../world3d/wall';
import type { PlaneState } from './smoothing';

// The trail of one aircraft: a fat line at the real altitude plus a faint wall down to the ground. The last point
// follows the aircraft and is moved in place every frame; the rest is rebuilt only when a new position was
// reported. Ported from the old app's TrailRig.

export const TRAIL_COLOR = '#ff6a2b';
/** a trail fades out over this time (the one of the selected aircraft stays complete) */
export const TRAIL_FADE_MS = 20_000;
/** the wall below a trail only exists at low altitude (take-off, landing, helicopters): full below, gone above */
export const WALL_FULL_M = 800;
export const WALL_MAX_M = 1500;
/** all trails faint and fading out, the one of the selected aircraft complete and at full strength */
const STYLE = { width: 2, opacity: 0.55, fade: TRAIL_FADE_MS, wall: 0.06 };
const STYLE_SELECTED = { width: 3, opacity: 1, fade: 0, wall: 0.15 };

export class TrailRig {
  readonly line = new GeoLine([], { color: TRAIL_COLOR, width: STYLE.width, opacity: STYLE.opacity, fadeMs: STYLE.fade });
  readonly wall = new GeoWall({ color: TRAIL_COLOR, fullM: WALL_FULL_M, goneM: WALL_MAX_M });
  private count = -1;
  /** longitude of the last point, the head stays next to it across the antimeridian */
  private lastLon = 0;
  /** the points as built, with continuous longitudes (for picking) */
  points: Vec3[] = [];
  times: number[] = [];

  private near(lon: number) {
    return lon + 360 * Math.round((this.lastLon - lon) / 360);
  }

  private build(trail: PlaneState['trail']) {
    this.lastLon = trail[0]?.[0] ?? 0;
    const pts = trail.map((t): Vec3 => {
      this.lastLon = this.near(t[0]);
      return [this.lastLon, t[1], t[2]];
    });
    const lastPt = pts[pts.length - 1];
    if (lastPt) pts.push(lastPt); // the head, moved every frame
    const times = [...trail.map((t) => t[3]), -1];
    this.line.setPoints(pts, times);
    this.wall.setPoints(pts, times);
    this.points = pts;
    this.times = times;
    this.count = trail.length;
  }

  /** Brings the geometry to the aircraft's trail and current (displayed) position. */
  sync(p: PlaneState, selected: boolean, frame: GeoFrame, now: number) {
    if (p.trail.length !== this.count) this.build(p.trail);
    if (!this.points.length) return;
    const head: Vec3 = [this.near(p.dLon), p.dLat, p.ground ? 0.3 : p.dAlt];
    this.line.setHead(head);
    this.wall.setHead(head);
    this.points[this.points.length - 1] = head;
    const style = selected ? STYLE_SELECTED : STYLE;
    this.line.setWidth(style.width);
    this.line.setOpacity(style.opacity);
    this.line.setFade(style.fade);
    this.wall.setStyle(style.wall, style.fade);
    this.line.update(frame, now);
    this.wall.update(frame, now);
    this.wall.object.visible = !p.ground && p.dAlt > 3;
  }

  hide() {
    this.line.object.visible = this.wall.object.visible = false;
  }

  dispose() {
    this.line.dispose();
    this.wall.dispose();
  }
}
