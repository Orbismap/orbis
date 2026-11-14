import type { Map as MlMap } from 'maplibre-gl';
import type { Stage } from '../world3d/stage';
import { focusCentre, slerp } from './follow-math';
import type { PlanesPart } from './planes';

// Follow camera: keeps the selected aircraft in the middle of the screen while it flies. Simplified from the old
// app's GeoFocus: that one switched off all of the map's input handlers and owned the whole camera. This one only
// moves the map CENTRE (and its elevation on the flat map) and leaves zoom, bearing and pitch to the user and to the
// base's camera limits (map/limits.ts): tilt limit by zoom and rubber band work exactly as without following, and the
// user can still zoom (around the centre), turn and tilt. Following ends
//   - when the user drags the map (pan) or another flight / jump moves the centre (search, "Hierhin fliegen", URL),
//   - when the aircraft is deselected or disappears from the data (the caller ends it),
//   - on Escape.

const FLY_IN_MS = 900;
/** the centre moved further than this without us (degrees) */
const OTHER_CAMERA_DEG = 1e-6;
const EVENT_FLAG = 'proFollow';

interface CameraInternals {
  applyTransformChange(change: (tr: { setElevation(e: number): void }) => void): void;
}

export class Follow {
  private target: string | null = null;
  private raf = 0;
  private startedAt = 0;
  private from: [number, number] = [0, 0];
  private fromElevation = 0;
  private lastCentre: [number, number] = [0, 0];
  private last = '';
  private restore: { clamped: boolean; scroll: boolean; touch: boolean } | null = null;
  private listeners: (() => void)[] = [];

  constructor(
    private map: MlMap,
    private stage: Stage,
    private part: PlanesPart,
    private reducedMotion: () => boolean,
  ) {}

  get id(): string | null {
    return this.target;
  }

  /** `fn` is called whenever the followed aircraft changes (start, stop). */
  listen(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  }

  private changed() {
    this.part.followed = this.target;
    for (const fn of this.listeners) fn();
  }

  start(id: string) {
    if (this.target === id) return;
    const map = this.map;
    const c = map.getCenter();
    this.target = id;
    this.from = [c.lng, c.lat];
    this.fromElevation = map.getCenterElevation();
    this.lastCentre = [c.lng, c.lat];
    this.last = '';
    this.startedAt = performance.now();
    if (!this.restore) {
      this.restore = { clamped: map.getCenterClampedToGround(), scroll: map.scrollZoom.isEnabled(), touch: map.touchZoomRotate.isEnabled() };
      map.stop();
      map.setCenterClampedToGround(false);
      // wheel and pinch zoom around the aircraft in the middle, not around the cursor: that would move the centre
      if (this.restore.scroll) map.scrollZoom.enable({ around: 'center' });
      if (this.restore.touch) map.touchZoomRotate.enable({ around: 'center' });
      map.on('dragstart', this.onDragStart);
      map.on('move', this.onMove);
      window.addEventListener('keydown', this.onKey);
      this.raf = requestAnimationFrame(this.tick);
    }
    this.changed();
  }

  /** `handedOver`: someone else moves the camera already, so it must not be touched. */
  stop(handedOver = false) {
    if (this.target === null) return;
    this.target = null;
    cancelAnimationFrame(this.raf);
    this.stage.clock = null;
    const map = this.map;
    map.off('dragstart', this.onDragStart);
    map.off('move', this.onMove);
    window.removeEventListener('keydown', this.onKey);
    const r = this.restore;
    this.restore = null;
    if (r) {
      if (r.scroll) map.scrollZoom.enable();
      if (r.touch) map.touchZoomRotate.enable();
      map.setCenterClampedToGround(r.clamped);
    }
    if (handedOver) {
      // written through the camera: a camera call would end the flight that just began
      (map as unknown as { _camera?: CameraInternals })._camera?.applyTransformChange((tr) => tr.setElevation(0));
    } else if (map.getCenterElevation() !== 0) {
      // back down to the ground, the map does not know anything else
      map.easeTo({ elevation: 0, duration: this.reducedMotion() ? 0 : 450 });
    }
    this.changed();
  }

  private tick = () => {
    const id = this.target;
    if (!id) return;
    this.raf = requestAnimationFrame(this.tick);
    const time = performance.now();
    // the part and the camera work with the same instant, so the aircraft stays exactly in the middle
    this.part.step(time);
    const p = this.part.positionOf(id);
    if (!p) {
      this.stop();
      return;
    }
    this.stage.clock = time;
    const map = this.map;
    const raw = this.reducedMotion() ? 1 : Math.min(1, (time - this.startedAt) / FLY_IN_MS);
    const k = raw * raw * (3 - 2 * raw);
    const aim = focusCentre(p, map.getBearing(), map.getPitch(), this.stage.frame?.t ?? 1);
    const centre = k < 1 ? slerp(this.from, aim, k) : aim;
    const elevation = this.fromElevation + (p[2] - this.fromElevation) * k;
    const state = `${centre[0]}|${centre[1]}|${elevation}|${map.getBearing()}|${map.getPitch()}|${map.getZoom()}`;
    if (state === this.last) return;
    this.last = state;
    // a camera update of ours, for whoever listens to the move events
    map.jumpTo({ center: centre, elevation }, { [EVENT_FLAG]: true });
    const c = map.getCenter();
    this.lastCentre = [c.lng, c.lat];
  };

  private onDragStart = () => this.stop(true);

  /** A flight or a jump from elsewhere (search, a panel): that wins, the follow lets go. */
  private onMove = (e: object) => {
    if ((e as Record<string, unknown>)[EVENT_FLAG]) return;
    const c = this.map.getCenter();
    const dLng = ((c.lng - this.lastCentre[0] + 540) % 360) - 180;
    if (Math.abs(dLng) > OTHER_CAMERA_DEG || Math.abs(c.lat - this.lastCentre[1]) > OTHER_CAMERA_DEG) this.stop(true);
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.stop();
  };
}
