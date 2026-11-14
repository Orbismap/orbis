import type { Map as MlMap } from 'maplibre-gl';
import type { Stage, StagePart } from './stage';
import { distanceZoomFor, focusCentre, highestDistanceZoom, latScale, maxDistanceZoom, slerp, solveCamera } from './follow-math';

// Follow camera: keeps one object of a stage part (an aircraft, later a ship or a satellite) in the middle of the
// screen while it moves. Dragging turns and tilts the camera around it, the wheel and pinch zoom towards it. A click
// on an object of a part that can be followed starts following it, or switches to it without stopping. Ported from the old app's GeoFocus.
//
// The map's own input handlers are off meanwhile: they would be cancelled by every camera update of a moving
// aircraft, and a left drag would pan. Bearing, tilt and zoom (as the distance to the aircraft, not to the map
// centre) live here and are written together with the centre once per frame, so nothing can drift apart. The base's
// camera limits (tilt limit by zoom, north-up, rubber band) are held off meanwhile (`holdCamera`): the follow has its
// own tilt range, and nothing turns rotation and tilt back. On letting go the camera eases ONCE onto the limits.
// Following ends
//   - when another flight / jump moves the centre (search, "Hierhin fliegen", URL),
//   - when the object is deselected or disappears from the data (the caller ends it),
//   - on Escape.

const FLY_IN_MS = 900;
const WHEEL_ZOOM_PER_PIXEL = 0.002;
/** time constant of the zoom smoothing (s) */
const ZOOM_SMOOTH_S = 0.08;
const BEARING_PER_PIXEL = 0.8;
const PITCH_PER_PIXEL = 0.5;
/** the follow camera's own tilt maximum (degrees) */
const FOCUS_MAX_PITCH = 85;
/** a pointer that moved further than this (CSS px) between down and up made a drag, not a click */
const DRAG_PX = 4;
/** the centre moved further than this without us (degrees) */
const OTHER_CAMERA_DEG = 1e-6;
const EVENT_FLAG = 'proFollow';
const HANDLERS = ['scrollZoom', 'boxZoom', 'dragRotate', 'dragPan', 'keyboard', 'doubleClickZoom', 'touchZoomRotate', 'touchPitch'] as const;

interface CameraInternals {
  applyTransformChange(change: (tr: { setElevation(e: number): void }) => void): void;
}

export class Follow {
  private target: string | null = null;
  private part: StagePart | null = null;
  private dragged = false;
  private raf = 0;
  private startedAt = 0;
  private lastTick = 0;
  private from: [number, number] = [0, 0];
  private fromElevation = 0;
  private lastCentre: [number, number] = [0, 0];
  private last = '';
  private bearing = 0;
  private pitch = 0;
  /** zoom of the distance to the aircraft: wanted and shown */
  private wanted = 0;
  private zoom = 0;
  private restore: { handlers: string[]; clamped: boolean; touchAction: string } | null = null;
  private unhold: ((ease?: { elevation: number }) => void) | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private down = new Map<number, { x: number; y: number }>();
  private listeners: (() => void)[] = [];

  constructor(
    private map: MlMap,
    private stage: Stage,
    private reducedMotion: () => boolean,
    private holdCamera: () => (ease?: { elevation: number }) => void,
  ) {
    stage.clicks = this;
  }

  /** The part that holds the followed object. */
  get followedPart(): StagePart | null {
    return this.part;
  }

  /** The pointer that just ended moved too far for a click: the stage ignores that click. */
  get wasDrag(): boolean {
    return this.target !== null && this.dragged;
  }

  /** A click hit `id` of `part`: the camera follows it, from where it is (no-op on the followed object itself). */
  retarget(part: StagePart, id: string) {
    if (part.positionOf) this.start(part, id);
  }

  dispose() {
    this.stop();
    if (this.stage.clicks === this) this.stage.clicks = null;
  }

  get id(): string | null {
    return this.target;
  }

  /** `fn` is called whenever the followed object changes (start, stop). */
  listen(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  }

  private changed() {
    for (const fn of this.listeners) fn();
  }

  private toCentre() {
    return this.stage.frame?.pxDistance ?? this.map.getCanvas().clientHeight * 1.5;
  }

  /** Follows `id` of `part`; while already following, the camera flies over from where it is, with the same view. */
  start(part: StagePart, id: string) {
    if (!part.positionOf || (this.part === part && this.target === id)) return;
    const map = this.map;
    map.stop();
    const c = map.getCenter();
    const switching = this.restore !== null;
    if (this.part !== part) this.part?.setFollowed?.(null);
    this.part = part;
    part.setFollowed?.(id);
    this.target = id;
    this.from = [c.lng, c.lat];
    this.fromElevation = map.getCenterElevation();
    this.lastCentre = [c.lng, c.lat];
    this.bearing = map.getBearing();
    this.pitch = map.getPitch();
    const alt = part.positionOf(id)?.[2] ?? 0;
    const toCentre = this.toCentre();
    const farthest = maxDistanceZoom(alt, toCentre);
    // switching: the distance to the object stays; otherwise it is the one the map has now
    // (from a map zoom nearer than the object's height allows, the distance zoom would be absurd)
    this.wanted = Math.min(switching ? this.wanted : distanceZoomFor(map.getZoom() - latScale(c.lat), alt, this.pitch, 1, toCentre), farthest);
    this.zoom = Math.min(switching ? this.zoom : this.wanted, farthest);
    this.last = '';
    this.startedAt = performance.now();
    if (!this.restore) {
      const handlers = HANDLERS.filter((h) => map[h].isEnabled());
      for (const h of handlers) map[h].disable();
      const box = map.getCanvasContainer();
      this.restore = { handlers, clamped: map.getCenterClampedToGround(), touchAction: box.style.touchAction };
      map.setCenterClampedToGround(false);
      this.unhold = this.holdCamera();
      box.style.touchAction = 'none';
      // capture: the app may have wheel listeners of its own on the map
      box.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
      box.addEventListener('pointerdown', this.onDown);
      box.addEventListener('pointermove', this.onMove);
      box.addEventListener('pointerup', this.onUp);
      box.addEventListener('pointercancel', this.onUp);
      this.dragged = false;
      map.on('move', this.onCameraMove);
      window.addEventListener('keydown', this.onKey);
      this.lastTick = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
    this.changed();
  }

  /** `handedOver`: someone else moves the camera already, so it must not be touched. */
  stop(handedOver = false) {
    if (this.target === null) return;
    this.target = null;
    this.part?.setFollowed?.(null);
    this.part = null;
    cancelAnimationFrame(this.raf);
    this.stage.clock = null;
    this.pointers.clear();
    this.down.clear();
    const map = this.map;
    const box = map.getCanvasContainer();
    box.removeEventListener('wheel', this.onWheel, { capture: true });
    box.removeEventListener('pointerdown', this.onDown);
    box.removeEventListener('pointermove', this.onMove);
    box.removeEventListener('pointerup', this.onUp);
    box.removeEventListener('pointercancel', this.onUp);
    map.off('move', this.onCameraMove);
    window.removeEventListener('keydown', this.onKey);
    const r = this.restore;
    this.restore = null;
    if (r) {
      for (const h of r.handlers) map[h as (typeof HANDLERS)[number]].enable();
      box.style.touchAction = r.touchAction;
      map.setCenterClampedToGround(r.clamped);
    }
    const unhold = this.unhold;
    this.unhold = null;
    if (handedOver) {
      // written through the camera: a camera call would end the flight that just began
      (map as unknown as { _camera?: CameraInternals })._camera?.applyTransformChange((tr) => tr.setElevation(0));
      unhold?.();
    } else {
      // one motion back onto the limits, down to the ground as well (the map does not know anything else)
      unhold?.({ elevation: 0 });
    }
    this.changed();
  }

  private tick = (now: number) => {
    const id = this.target;
    const part = this.part;
    if (!id || !part?.positionOf) return;
    this.raf = requestAnimationFrame(this.tick);
    const time = performance.now();
    // the part and the camera work with the same instant, so the aircraft stays exactly in the middle
    part.step?.(time);
    const p = part.positionOf(id);
    if (!p) {
      this.stop();
      return;
    }
    this.stage.clock = time;
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    const map = this.map;
    const toCentre = this.toCentre();
    const raw = this.reducedMotion() ? 1 : Math.min(1, (time - this.startedAt) / FLY_IN_MS);
    const k = raw * raw * (3 - 2 * raw);
    // the centre for a given `t` (the fly-in starts from where the camera is)
    const centreFor = (t: number) => {
      const aim = focusCentre(p, this.bearing, this.pitch, t);
      return k < 1 ? slerp(this.from, aim, k) : aim;
    };
    const solve = () => solveCamera(p, this.bearing, this.pitch, this.zoom, toCentre, centreFor);
    // a wheel turned on at the limit must not have to be turned all the way back
    const scale = latScale(solve().centre[1]);
    const lowest = distanceZoomFor(map.getMinZoom() + 0.05 - scale, p[2], this.pitch, 1, toCentre);
    const highest = highestDistanceZoom(map.getMaxZoom() - scale, p[2], this.pitch, 1, toCentre);
    this.wanted = Math.max(lowest, Math.min(highest, this.wanted));
    this.zoom += this.reducedMotion() ? this.wanted - this.zoom : (this.wanted - this.zoom) * (1 - Math.exp(-dt / ZOOM_SMOOTH_S));
    const { zoom, centre } = solve();
    // the centre stays on the ground: the elevation of where the flight started fades out
    const elevation = this.fromElevation * (1 - k);
    const state = `${centre[0]}|${centre[1]}|${zoom}|${this.bearing}|${this.pitch}|${elevation}`;
    if (state === this.last) return;
    this.last = state;
    // a camera update of ours, for whoever listens to the move events
    map.jumpTo({ center: centre, zoom, bearing: this.bearing, pitch: this.pitch, elevation }, { [EVENT_FLAG]: true });
    const c = map.getCenter();
    this.lastCentre = [c.lng, c.lat];
  };

  /** A flight or a jump from elsewhere (search, a panel): that wins, the follow lets go. A resize keeps the centre. */
  private onCameraMove = (e: object) => {
    if ((e as Record<string, unknown>)[EVENT_FLAG]) return;
    const c = this.map.getCenter();
    const dLng = ((c.lng - this.lastCentre[0] + 540) % 360) - 180;
    if (Math.abs(dLng) > OTHER_CAMERA_DEG || Math.abs(c.lat - this.lastCentre[1]) > OTHER_CAMERA_DEG) this.stop(true);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // lines (mouse wheels in some browsers) are about 40 pixels
    const delta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    this.wanted -= delta * WHEEL_ZOOM_PER_PIXEL;
  };

  private onDown = (e: PointerEvent) => {
    // the first finger starts a new gesture; a second one is never a click
    this.dragged = this.pointers.size > 0;
    this.down.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.map.getCanvasContainer().setPointerCapture?.(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const d0 = this.down.get(e.pointerId);
    if (d0 && Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > DRAG_PX) this.dragged = true;
    const others = [...this.pointers.entries()].filter(([id]) => id !== e.pointerId);
    if (others.length === 1) {
      // two fingers: spread to zoom, turn to turn
      const other = others[0]![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 0 && after > 0) this.wanted += Math.log2(after / before);
      const angle = (x: number, y: number) => (Math.atan2(y - other.y, x - other.x) * 180) / Math.PI;
      this.bearing -= ((angle(e.clientX, e.clientY) - angle(prev.x, prev.y) + 540) % 360) - 180;
    } else if (others.length === 0) {
      this.bearing += (e.clientX - prev.x) * BEARING_PER_PIXEL;
      this.pitch = Math.max(0, Math.min(FOCUS_MAX_PITCH, this.pitch - (e.clientY - prev.y) * PITCH_PER_PIXEL));
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.down.delete(e.pointerId);
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.stop();
  };
}
