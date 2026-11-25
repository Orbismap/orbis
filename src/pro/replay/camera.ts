import type { Map as MlMap } from 'maplibre-gl';
import type { ReplayChannel, ShotView } from '../../ext/types';
import { distanceZoomFor, focusCentre, latScale, slerp, solveCamera, zoomForDistance } from '../world3d/follow-math';
import type { Stage } from '../world3d/stage';

// The camera of the replay mode. The director (base) says, per phase, what to look at, from which side and how far; this moves the
// map camera there. The target is tracked exactly every frame (the camera runs in the same frame as the playhead), only the
// distance, tilt and side glide, and a change of shot flies the centre over. Dragging turns and tilts around the target, the wheel
// moves in and out; each new phase takes the camera back to the director's shot. Built on the maths of the follow camera.

/** how fast distance, tilt and side settle (s) */
const SETTLE_S = 0.7;
/** a change of shot flies the centre over in about this time (s) */
const FLY_S = 1.2;
const BEARING_PER_PIXEL = 0.5;
const PITCH_PER_PIXEL = 0.35;
const WHEEL_PER_PIXEL = 0.0015;
const MAX_PITCH = 85;
const HANDLERS = ['scrollZoom', 'boxZoom', 'dragRotate', 'dragPan', 'keyboard', 'doubleClickZoom', 'touchZoomRotate', 'touchPitch'] as const;

const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export class ReplayCamera {
  private on = false;
  private unhold: ((ease?: { elevation: number }) => void) | null = null;
  private restore: { handlers: (typeof HANDLERS)[number][]; clamped: boolean; touchAction: string } | null = null;
  private stopFrame: (() => void) | null = null;
  private stopEvent: () => void;
  private pointer: { id: number; x: number; y: number; ox: number; oy: number } | null = null;
  private dragged = false;

  // what is shown
  private focus: [number, number, number] = [0, 0, 0];
  private bearing = 0;
  private pitch = 0;
  private logDist = 0;
  // what the user added on top of the director's shot
  private userBearing = 0;
  private userPitch = 0;
  private userZoom = 0;
  private phase = '';
  private seeks = -1;
  private flying = 0;
  private fresh = true;

  constructor(
    private map: MlMap,
    private stage: Stage,
    private replay: ReplayChannel,
    private holdCamera: () => (ease?: { elevation: number }) => void,
    private reducedMotion: () => boolean,
  ) {
    this.stopEvent = replay.event.subscribe((ev) => (ev ? this.start() : this.stop()));
  }

  private start() {
    if (this.on) return;
    this.on = true;
    this.fresh = true;
    this.phase = '';
    const map = this.map;
    map.stop();
    const handlers = HANDLERS.filter((h) => map[h].isEnabled());
    for (const h of handlers) map[h].disable();
    const box = map.getCanvasContainer();
    this.restore = { handlers: [...handlers], clamped: map.getCenterClampedToGround(), touchAction: box.style.touchAction };
    map.setCenterClampedToGround(false);
    this.unhold = this.holdCamera();
    box.style.touchAction = 'none';
    box.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    box.addEventListener('pointerdown', this.onDown);
    box.addEventListener('pointermove', this.onMove);
    box.addEventListener('pointerup', this.onUp);
    box.addEventListener('pointercancel', this.onUp);
    this.stopFrame = this.replay.onFrame((_, dt) => this.frame(dt));
  }

  private stop() {
    if (!this.on) return;
    this.on = false;
    this.stopFrame?.();
    this.stopFrame = null;
    const map = this.map;
    const box = map.getCanvasContainer();
    box.removeEventListener('wheel', this.onWheel, { capture: true });
    box.removeEventListener('pointerdown', this.onDown);
    box.removeEventListener('pointermove', this.onMove);
    box.removeEventListener('pointerup', this.onUp);
    box.removeEventListener('pointercancel', this.onUp);
    const r = this.restore;
    this.restore = null;
    if (r) {
      for (const h of r.handlers) map[h].enable();
      box.style.touchAction = r.touchAction;
      map.setCenterClampedToGround(r.clamped);
    }
    const unhold = this.unhold;
    this.unhold = null;
    unhold?.({ elevation: 0 });
    this.stage.clock = null;
    this.stage.focus = null;
  }

  private frame(dt: number) {
    const shot = this.replay.shot();
    if (!shot) return;
    const instant = this.fresh || this.reducedMotion() || this.replay.seeks.peek() !== this.seeks;
    if (shot.phaseId !== this.phase) {
      // a new shot: the director takes the camera back, and the centre flies over from where it is
      this.userBearing = this.userPitch = this.userZoom = 0;
      if (this.phase && !instant) this.flying = FLY_S;
      this.phase = shot.phaseId;
    }
    this.seeks = this.replay.seeks.peek();
    this.advance(shot, dt, instant);
    this.fresh = false;
  }

  private advance(shot: ShotView, dt: number, instant: boolean) {
    const map = this.map;
    const toCentre = this.stage.frame?.pxDistance ?? map.getCanvas().clientHeight * 1.5;
    const wantPitch = Math.max(0, Math.min(MAX_PITCH, shot.pitch + this.userPitch));
    const wantBearing = shot.bearing + this.userBearing;
    // not closer than 8 m: a vehicle is 50 m long
    const wantLog = Math.max(3, Math.log2(Math.max(1, shot.distM)) - this.userZoom);
    if (instant) {
      this.focus = [...shot.target];
      this.bearing = wantBearing;
      this.pitch = wantPitch;
      this.logDist = wantLog;
      this.flying = 0;
    } else {
      const k = 1 - Math.exp(-dt / SETTLE_S);
      this.bearing += wrap(wantBearing - this.bearing) * k;
      this.pitch += (wantPitch - this.pitch) * k;
      this.logDist += (wantLog - this.logDist) * k;
      if (this.flying > 0) {
        // fly the centre over: the target keeps moving, so this chases it rather than aiming at a fixed point
        const f = 1 - Math.exp(-dt / 0.3);
        const [lng, lat] = slerp([this.focus[0], this.focus[1]], [shot.target[0], shot.target[1]], f);
        this.focus = [lng, lat, this.focus[2] + (shot.target[2] - this.focus[2]) * f];
        this.flying -= dt;
        if (this.flying <= 0) this.focus = [...shot.target];
      } else this.focus = [...shot.target];
    }
    const p = this.focus;
    // the depth range reaches in to the vehicle, so it is never cut off by the near plane
    this.stage.focus = [p[0], p[1], p[2]];
    // the nearest and farthest the map's zoom allows
    const scale = latScale(p[1]);
    const lowest = distanceZoomFor(map.getMinZoom() + 0.05 - scale, p[2], this.pitch, 1, toCentre);
    const highest = distanceZoomFor(map.getMaxZoom() - scale, p[2], this.pitch, 1, toCentre);
    const dz = Math.max(lowest, Math.min(highest, zoomForDistance(2 ** this.logDist, toCentre)));
    const { zoom, centre } = solveCamera(p, this.bearing, this.pitch, dz, toCentre, (t) => focusCentre(p, this.bearing, this.pitch, t));
    // the centre stays on the ground (see follow-math.ts); a camera update of ours, for whoever listens to the move events
    map.jumpTo({ center: centre, zoom, bearing: this.bearing, pitch: this.pitch, elevation: 0 }, { proFollow: true });
  }

  /** the pointer that just ended dragged the view: its click must not pick a vehicle */
  get wasDrag(): boolean {
    return this.dragged;
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    // wheel up moves in: the zoom factor grows
    this.userZoom = Math.max(-8, Math.min(8, this.userZoom - delta * WHEEL_PER_PIXEL));
  };

  private onDown = (e: PointerEvent) => {
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY };
    this.dragged = false;
    this.map.getCanvasContainer().setPointerCapture?.(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointer;
    if (!p || p.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - p.ox, e.clientY - p.oy) > 4) this.dragged = true;
    this.userBearing += (e.clientX - p.x) * BEARING_PER_PIXEL;
    this.userPitch = Math.max(-90, Math.min(90, this.userPitch - (e.clientY - p.y) * PITCH_PER_PIXEL));
    p.x = e.clientX;
    p.y = e.clientY;
  };

  private onUp = (e: PointerEvent) => {
    if (this.pointer?.id === e.pointerId) this.pointer = null;
  };

  dispose() {
    this.stopEvent();
    this.stop();
  }
}
