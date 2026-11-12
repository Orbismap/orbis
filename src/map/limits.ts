// Enforces the camera limits (tilt by zoom, north-up when zoomed out) for every input path on the MapLibre map.
// The allowed tilt follows the zoom frame by frame by moving the transform's max pitch (which clamps the running
// pitch) instead of calling jumpTo/easeTo, so running zoom animations are never restarted. Zooming back in does not
// restore a squeezed tilt: the animation only interpolates values it was asked to change.
import type { Map as MlMap } from 'maplibre-gl';
import { reducedMotion } from '../state/settings';
import { BEARING_STRETCH, NORTH_MAX_ZOOM, REBOUND_MS, STRETCH_PITCH_CEILING, needsNorthReset, pitchStretch, rubberBand, tiltAvailable, tiltLimit, wrapBearing } from './camera';

type Tr = { setMaxPitch(p: number): void; setBearing(b: number): void; setPitch(p: number): void };
interface CameraInternals { applyTransformChange(change: (tr: Tr) => void): void }

export const NORTH_EASE_MS = REBOUND_MS;
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);

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

  // A gesture (mouse, touch) may pull a little past the limits against growing resistance (rubber band); on release
  // the camera eases back onto the limit. While a gesture runs or the rebound plays, the transform gets room above the limit.
  let down = false;
  let rotating = false;
  let raf = 0;
  let rawP = 0;
  let lastP = 0;
  let rawB = 0;
  let lastB = 0;

  const setMax = (v: number) => {
    if (Math.abs(ml.getMaxPitch() - v) < 1e-6) return;
    change((tr) => tr.setMaxPitch(v));
    ml.triggerRepaint();
  };
  const maxFor = (zoom: number) => {
    const lim = tiltLimit(zoom);
    return down || raf ? Math.min(STRETCH_PITCH_CEILING, lim + pitchStretch(lim)) : lim;
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
  // out); done on the transform, so a running zoom animation is left alone ----
  const cancelRebound = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  const startRebound = (fromGesture = false) => {
    if (raf || down || rotating) return;
    const z0 = ml.getZoom();
    const overP = ml.getPitch() - tiltLimit(z0) > 0.01 && ml.getMaxPitch() > tiltLimit(z0) + 1e-6;
    const overB = needsNorthReset(z0, ml.getBearing());
    if (!overP && !overB) {
      if (fromGesture) syncLimits();
      return;
    }
    if (reducedMotion()) {
      change((tr) => {
        if (overP) tr.setPitch(tiltLimit(ml.getZoom()));
        if (overB) tr.setBearing(0);
      });
      ml.triggerRepaint();
      syncLimits();
      onBearingFrame();
      return;
    }
    const p0 = ml.getPitch();
    const b0 = wrapBearing(ml.getBearing());
    const t0 = performance.now();
    let first = true;
    const step = (now: number) => {
      // a pointer inertia (easeTo after the release) would fight the rebound; raf stays set meanwhile (keeps the room above the limit)
      if (first && fromGesture && ml.isMoving()) ml.stop();
      first = false;
      raf = 0;
      if (down || rotating) return;
      const z = ml.getZoom();
      const p = Math.min(1, (now - t0) / REBOUND_MS);
      const k = 1 - easeOutCubic(p);
      const target = tiltLimit(z);
      const pitch = overP ? (p >= 1 ? target : target + Math.max(0, p0 - target) * k) : undefined;
      const bearing = overB && z < NORTH_MAX_ZOOM ? (p >= 1 ? 0 : b0 * k) : undefined;
      change((tr) => {
        if (pitch !== undefined) tr.setPitch(Math.min(pitch, ml.getMaxPitch()));
        if (bearing !== undefined) tr.setBearing(bearing);
      });
      ml.triggerRepaint();
      onBearingFrame();
      if (p < 1) raf = requestAnimationFrame(step);
      else syncLimits();
    };
    raf = requestAnimationFrame(step);
  };
  const startNorth = () => startRebound(false);

  // ---- rubber band while a gesture runs: pitch and bearing changes of the gesture are summed up unclamped ("raw") and
  // written back stretched ----
  const onGestureMove = () => {
    if (!down) return;
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
      lastB = Math.sign(rawB) * rubberBand(Math.abs(rawB), 0, BEARING_STRETCH);
      change((tr) => tr.setBearing(lastB));
    }
    onBearingFrame();
  };
  const onDown = () => {
    cancelRebound();
    down = true;
    rawP = lastP = ml.getPitch();
    lastB = ml.getBearing();
    rawB = wrapBearing(lastB);
    syncLimits();
  };
  const onUp = () => {
    if (!down) return;
    down = false;
    startRebound(true);
  };
  const container = ml.getCanvasContainer();
  container.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  const onMove = () => {
    onGestureMove();
    syncLimits();
    startNorth();
  };
  const onRotateStart = () => {
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
      ml.jumpTo = jumpTo;
      ml.off('move', onMove);
      ml.off('zoomend', onMove);
      ml.off('rotatestart', onRotateStart);
      ml.off('rotateend', onRotateEnd);
    },
  };
}
