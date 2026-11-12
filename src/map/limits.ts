// Enforces the camera limits (tilt by zoom, north-up when zoomed out) for every input path on the MapLibre map.
// The allowed tilt follows the zoom frame by frame by moving the transform's max pitch (which clamps the running
// pitch) instead of calling jumpTo/easeTo, so running zoom animations are never restarted. Zooming back in does not
// restore a squeezed tilt: the animation only interpolates values it was asked to change.
import type { Map as MlMap } from 'maplibre-gl';
import { NORTH_MAX_ZOOM, needsNorthReset, tiltAvailable, tiltLimit, wrapBearing } from './camera';

type Tr = { setMaxPitch(p: number): void; setBearing(b: number): void };
interface CameraInternals { applyTransformChange(change: (tr: Tr) => void): void }

export const NORTH_EASE_MS = 450;
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
    else fn({ setMaxPitch: (p) => ml.setMaxPitch(p), setBearing: (b) => ml.setBearing(b) });
  };

  const setMax = (v: number) => {
    if (Math.abs(ml.getMaxPitch() - v) < 1e-6) return;
    change((tr) => tr.setMaxPitch(v));
    ml.triggerRepaint();
  };
  const ensureFor = (zoom: number) => setMax(tiltLimit(zoom));

  let touchPitchOn = true;
  const syncLimits = () => {
    const z = ml.getZoom();
    setMax(tiltLimit(z));
    const avail = tiltAvailable(z);
    if (avail !== touchPitchOn) {
      touchPitchOn = avail;
      if (avail) ml.touchPitch.enable();
      else ml.touchPitch.disable();
    }
  };

  // ---- north-up: ease the bearing back to 0 on the transform, so a running zoom animation is left alone ----
  let rotating = false;
  let raf = 0;
  const cancelNorth = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  const startNorth = () => {
    if (raf || rotating || !needsNorthReset(ml.getZoom(), ml.getBearing())) return;
    const from = wrapBearing(ml.getBearing());
    const t0 = performance.now();
    const step = (now: number) => {
      raf = 0;
      if (ml.getZoom() >= NORTH_MAX_ZOOM || rotating) return;
      const p = Math.min(1, (now - t0) / NORTH_EASE_MS);
      const b = p >= 1 ? 0 : from * (1 - easeOutCubic(p));
      change((tr) => tr.setBearing(b));
      ml.triggerRepaint();
      onBearingFrame();
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };

  const onMove = () => {
    syncLimits();
    startNorth();
  };
  const onRotateStart = () => {
    rotating = true;
    cancelNorth();
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
      cancelNorth();
      ml.jumpTo = jumpTo;
      ml.off('move', onMove);
      ml.off('zoomend', onMove);
      ml.off('rotatestart', onRotateStart);
      ml.off('rotateend', onRotateEnd);
    },
  };
}
