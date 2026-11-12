// Enforces the camera limits (tilt by zoom, north-up when zoomed out) for every input path on the MapLibre map.
// The allowed tilt follows the zoom frame by frame by moving the transform's max pitch (which clamps the running
// pitch) instead of calling jumpTo/easeTo, so running zoom animations are never restarted. Zooming back in does not
// restore a squeezed tilt: the animation only interpolates values it was asked to change.
import type { Map as MlMap } from 'maplibre-gl';
import { reducedMotion } from '../state/settings';
import { BEARING_FREE, BEARING_STRETCH, NORTH_MAX_ZOOM, REBOUND_MS, REBOUND_SNAP_BELOW, STRETCH_PITCH_CEILING, TILT_ROOM, needsNorthReset, pitchStretch, reboundDuration, reboundExcess, rubberBand, rubberBandInverse, tiltAvailable, tiltLimit, wrapBearing } from './camera';

type Tr = { setMaxPitch(p: number): void; setBearing(b: number): void; setPitch(p: number): void };
interface CameraInternals { applyTransformChange(change: (tr: Tr) => void): void }

export const NORTH_EASE_MS = REBOUND_MS;

/** The tilt slider stretches past its end like a drag does: it reports the raw (unclamped) tilt, the limit writes the stretched one. */
export interface TiltStretch { begin(): void; to(rawPitch: number): void; end(): void }
export const tiltStretch = new WeakMap<MlMap, TiltStretch>();
const bearingSoft = (raw: number) => Math.sign(raw) * rubberBand(Math.abs(raw), BEARING_FREE, BEARING_STRETCH);
const bearingRaw = (v: number) => Math.sign(v) * rubberBandInverse(Math.abs(v), BEARING_FREE, BEARING_STRETCH);

export interface CameraLimits {
  /** Prepares the limit for a target zoom before a jump/flight that sets zoom and pitch together. */
  ensureFor(zoom: number): void;
  destroy(): void;
}

export function attachCameraLimits(ml: MlMap, onBearingFrame: () => void): CameraLimits {
  // Setting the transform directly keeps MapLibre from firing move events / stopping animations (Map#setMaxPitch does).
  const cam = (ml as unknown as { _camera?: CameraInternals })._camera;
  const change = (fn: (tr: Tr) => void) => {
    if (cam?.applyTransformChange) cam.applyTransformChange(fn);
    else fn({ setMaxPitch: (p) => ml.setMaxPitch(p), setBearing: (b) => ml.setBearing(b), setPitch: (p) => ml.setPitch(p) });
  };

  // State machine: idle -> gesture (a pointer is down) -> rebound (own rAF animation) -> idle. The transform only gets room
  // above the limit outside idle; the room is withdrawn once the rebound is over (never earlier, or MapLibre clamps at once).
  const pointers = new Set<number>();
  let rotating = false; // rotation without a pointer (keyboard); pointer rotations are taken over at release
  let raf = 0;
  let rawP = 0;
  let lastP = 0;
  let rawB = 0;
  let lastB = 0;
  let own: { id: number; x: number; y: number; rawB: number; rawP: number } | null = null; // right/ctrl mouse drag (our own, see below)
  let slider = false; // the tilt slider is being dragged
  const gesture = () => pointers.size > 0 || slider;

  const setMax = (v: number) => {
    if (Math.abs(ml.getMaxPitch() - v) < 1e-6) return;
    change((tr) => tr.setMaxPitch(v));
    ml.triggerRepaint();
  };
  const maxFor = (zoom: number) => {
    const lim = tiltLimit(zoom);
    return gesture() || rotating || raf ? Math.min(STRETCH_PITCH_CEILING, lim + TILT_ROOM) : lim;
  };
  const ensureFor = (zoom: number) => setMax(maxFor(zoom));

  let touchPitchOn = true;
  const syncLimits = () => {
    const z = ml.getZoom();
    setMax(maxFor(z));
    const avail = tiltAvailable(z);
    if (avail !== touchPitchOn) {
      touchPitchOn = avail;
      if (avail) ml.touchPitch.enable();
      else ml.touchPitch.disable();
    }
  };

  // ---- rebound: ease pitch and bearing back onto what the zoom allows (after a stretched gesture, or north-up when zoomed
  // out); own rAF on the transform (no easeTo: MapLibre inertia / stop() cannot cancel it, a running zoom is left alone).
  // The overshoot shrinks while the target follows the CURRENT limit, so zooming meanwhile does not make it jump. ----
  const cancelRebound = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  const startRebound = (fromGesture = false) => {
    if (raf || gesture() || rotating) return;
    const z0 = ml.getZoom();
    const excessP = ml.getPitch() - tiltLimit(z0);
    const overP = excessP > 0.01 && ml.getMaxPitch() > tiltLimit(z0) + 1e-6;
    const overB = needsNorthReset(z0, ml.getBearing());
    if (!overP && !overB) {
      syncLimits();
      return;
    }
    const animP = overP && excessP >= REBOUND_SNAP_BELOW;
    if (reducedMotion() || (!animP && !overB)) {
      change((tr) => {
        if (overP) tr.setPitch(tiltLimit(ml.getZoom()));
        if (overB) tr.setBearing(0);
      });
      ml.triggerRepaint();
      syncLimits();
      onBearingFrame();
      return;
    }
    const b0 = wrapBearing(ml.getBearing());
    const dur = Math.max(animP ? reboundDuration(excessP) : 0, overB ? reboundDuration(b0, BEARING_STRETCH) : 0);
    const t0 = performance.now();
    let first = true;
    const step = (now: number) => {
      // a pointer inertia (easeTo after the release) would fight the rebound
      if (first && fromGesture && ml.isMoving()) ml.stop();
      first = false;
      raf = 0;
      if (gesture() || rotating) return; // a new gesture took over; it continues from the current value
      const z = ml.getZoom();
      const elapsed = now - t0;
      const done = elapsed >= dur;
      const target = tiltLimit(z);
      const pitch = animP ? target + reboundExcess(excessP, elapsed, dur) : undefined;
      const bearing = overB && z < NORTH_MAX_ZOOM ? reboundExcess(b0, elapsed, dur) : undefined;
      change((tr) => {
        if (pitch !== undefined) tr.setPitch(Math.min(pitch, ml.getMaxPitch()));
        if (bearing !== undefined) tr.setBearing(bearing);
      });
      ml.triggerRepaint();
      onBearingFrame();
      if (!done) raf = requestAnimationFrame(step);
      else syncLimits();
    };
    raf = requestAnimationFrame(step);
  };
  const startNorth = () => startRebound(false);

  // ---- rubber band while a gesture runs: pitch and bearing changes of the gesture are summed up unclamped ("raw") and
  // written back stretched ----
  const onGestureMove = () => {
    if (!gesture() || own || slider) return; // mouse drags and the slider write their own stretched values
    const z = ml.getZoom();
    const lim = tiltLimit(z);
    const dp = ml.getPitch() - lastP;
    if (Math.abs(dp) > 1e-6) {
      rawP = Math.max(0, rawP + dp);
      lastP = rubberBand(rawP, lim, pitchStretch(lim));
      if (Math.abs(lastP - ml.getPitch()) > 1e-6) change((tr) => tr.setPitch(lastP));
    }
    const db = wrapBearing(ml.getBearing() - lastB);
    if (z >= NORTH_MAX_ZOOM) {
      rawB = wrapBearing(ml.getBearing());
      lastB = ml.getBearing();
    } else if (Math.abs(db) > 1e-6) {
      rawB += db;
      lastB = bearingSoft(rawB);
      change((tr) => tr.setBearing(lastB));
    }
    onBearingFrame();
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') pointers.clear(); // a lost mouseup must not keep the gesture alive
    const wasGesture = gesture();
    pointers.add(e.pointerId);
    rotating = false;
    if (wasGesture) return;
    cancelRebound();
    // take over a stretched camera (e.g. mid-rebound) without a jump: the raw value is the inverse of the stretch
    const z = ml.getZoom();
    const lim = tiltLimit(z);
    lastP = ml.getPitch();
    rawP = rubberBandInverse(lastP, lim, pitchStretch(lim));
    lastB = ml.getBearing();
    rawB = z < NORTH_MAX_ZOOM ? bearingRaw(wrapBearing(lastB)) : wrapBearing(lastB);
    if (e.pointerType === 'mouse' && (e.button === 2 || (e.button === 0 && (e.ctrlKey || e.metaKey)))) {
      // right button / ctrl+left: our own rotate+tilt drag (MapLibre's dragRotate is off); raw angles are summed here
      own = { id: e.pointerId, x: e.clientX, y: e.clientY, rawB, rawP };
      try { container.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      e.preventDefault();
    }
    syncLimits();
  };
  const release = (e?: PointerEvent) => {
    if (!gesture()) return;
    if (e && e.pointerType !== 'mouse') pointers.delete(e.pointerId);
    else pointers.clear();
    if (gesture()) return; // another finger is still down
    rotating = false;
    own = null;
    startRebound(true);
  };
  const onUp = (e: PointerEvent) => release(e);
  const onLost = () => release();
  const container = ml.getCanvasContainer();
  container.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('mouseup', onLost);
  window.addEventListener('blur', onLost);
  // macOS fires contextmenu on mousedown: releasing the gesture there (as before) ended every right-drag at once
  const onContext = (e: Event) => e.preventDefault();
  container.addEventListener('contextmenu', onContext);
  // like MapLibre's own: 0.8 degrees of bearing per pixel across, 0.5 degrees of tilt per pixel up
  const onPointerMove = (e: PointerEvent) => {
    if (!own || e.pointerId !== own.id) return;
    if (e.buttons === 0) return release();
    own.rawB += (e.clientX - own.x) * 0.8;
    own.rawP = Math.max(0, own.rawP - (e.clientY - own.y) * 0.5);
    own.x = e.clientX;
    own.y = e.clientY;
    const z = ml.getZoom();
    const lim = tiltLimit(z);
    ml.jumpTo({ bearing: z < NORTH_MAX_ZOOM ? bearingSoft(own.rawB) : own.rawB, pitch: rubberBand(own.rawP, lim, pitchStretch(lim)) });
  };
  container.addEventListener('pointermove', onPointerMove);
  const wasDragRotate = ml.dragRotate.isEnabled();
  ml.dragRotate.disable();
  tiltStretch.set(ml, {
    begin() {
      cancelRebound();
      slider = true;
      syncLimits();
    },
    to(raw) {
      const lim = tiltLimit(ml.getZoom());
      ml.jumpTo({ pitch: rubberBand(Math.max(0, raw), lim, pitchStretch(lim)) });
    },
    end() {
      if (!slider) return;
      slider = false;
      startRebound(true);
    },
  });

  const onMove = () => {
    onGestureMove();
    syncLimits();
    startNorth();
  };
  const onRotateStart = () => {
    if (gesture()) return;
    rotating = true;
    cancelRebound();
  };
  const onRotateEnd = () => {
    rotating = false;
    startNorth();
  };
  // A jump sets zoom and pitch in one go; the limit for the new zoom has to be in place first (callers anywhere may jump).
  const jumpTo = ml.jumpTo.bind(ml) as MlMap['jumpTo'];
  ml.jumpTo = (options, eventData) => {
    if (typeof options?.zoom === 'number') ensureFor(options.zoom);
    return jumpTo(options, eventData);
  };
  ml.on('move', onMove);
  ml.on('zoomend', onMove);
  ml.on('rotatestart', onRotateStart);
  ml.on('rotateend', onRotateEnd);
  syncLimits();

  return {
    ensureFor,
    destroy() {
      cancelRebound();
      container.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('mouseup', onLost);
      container.removeEventListener('contextmenu', onContext);
      container.removeEventListener('pointermove', onPointerMove);
      tiltStretch.delete(ml);
      if (wasDragRotate) ml.dragRotate.enable();
      window.removeEventListener('blur', onLost);
      ml.jumpTo = jumpTo;
      ml.off('move', onMove);
      ml.off('zoomend', onMove);
      ml.off('rotatestart', onRotateStart);
      ml.off('rotateend', onRotateEnd);
    },
  };
}
