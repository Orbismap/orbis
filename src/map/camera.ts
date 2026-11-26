// Camera helpers: flyTo with padding, geolocation.
import type { Map as MlMap } from 'maplibre-gl';
import type { Padding } from '../state/view';
import type { CameraTarget } from './types';

/** Highest pitch the engine allows at all (MapLibre `maxPitch`); `tiltLimit` reaches it from zoom 12.5 on. */
export const ENGINE_MAX_PITCH = 70;
/** At or below this zoom the camera cannot tilt at all. */
export const TILT_ZOOM_FLAT = 2;
/** From this zoom on the full engine maximum is allowed. */
export const TILT_ZOOM_FULL = 12.5;
/** Below this zoom the map is north-up: a rotation eases back to bearing 0. */
export const NORTH_MAX_ZOOM = 5;
/** Below this limit (degrees) the map counts as flat: touch-pitch is switched off. */
export const TILT_FLAT_BELOW = 1;

const smoothstep = (x: number) => x * x * (3 - 2 * x);

/**
 * How far the camera may tilt at a zoom, in degrees. One continuous curve (C1, no kinks, no jumps):
 * 0 at zoom <= 2, smoothstep(t^0.75) with t = (zoom - 2) / 10.5, then ENGINE_MAX_PITCH from zoom 12.5 on.
 * The 0.75 exponent lifts the early part so a little tilt is possible soon after zoom 2 (z3 ~5.5, z5 ~24, z8 ~51).
 * Monotonic non-decreasing.
 */
export function tiltLimit(zoom: number): number {
  if (!Number.isFinite(zoom)) return 0;
  const t = Math.min(1, Math.max(0, (zoom - TILT_ZOOM_FLAT) / (TILT_ZOOM_FULL - TILT_ZOOM_FLAT)));
  return ENGINE_MAX_PITCH * smoothstep(Math.pow(t, 0.75));
}

/** True when the tilt limit at this zoom is large enough to be worth showing/using (>= 1 degree). */
export const tiltAvailable = (zoom: number) => tiltLimit(zoom) >= TILT_FLAT_BELOW;

/** Pitch cut to what the zoom allows (never below 0). */
export const clampPitch = (zoom: number, pitch: number) => Math.max(0, Math.min(pitch, tiltLimit(zoom)));

/**
 * Rubber band for a gesture that pulls past a limit (Apple-style stretch): up to `limit` the value follows the input 1:1,
 * beyond it the excess grows logarithmically, over = k * ln(1 + excess / k): slope 1 at the limit (no kink), then strictly
 * falling, unbounded (no plateau, the growing resistance itself is the limit). `k` is the stiffness in degrees. Pure.
 */
export function rubberBand(raw: number, limit: number, k: number): number {
  if (!(raw > limit) || !(k > 0)) return raw;
  return limit + k * Math.log(1 + (raw - limit) / k);
}
/** Inverse of `rubberBand` (same limit/k): the raw input that yields the stretched value `v`, so a new gesture takes over a stretched camera without a jump. */
export function rubberBandInverse(v: number, limit: number, k: number): number {
  if (!(v > limit) || !(k > 0)) return v;
  return limit + k * Math.expm1((v - limit) / k);
}

/** Stiffness k of the tilt stretch (degrees), as in the old Orbis: 3, so even a long drag stretches the tilt only ~10-15 degrees. */
export const TILT_STRETCH = 3;
export const pitchStretch = (_limit?: number) => TILT_STRETCH;
/** Room (degrees) the engine keeps above the zoom's limit while a gesture or the release animation runs, so the stretch can show. */
export const TILT_ROOM = 15;
/** Zoomed out (< NORTH_MAX_ZOOM) a rotation follows the mouse 1:1 for this many degrees (an eighth turn), then the resistance grows. */
export const BEARING_FREE = 22.5;
/** Stiffness k of the rotation stretch beyond BEARING_FREE (degrees), as in the old Orbis. */
export const BEARING_STRETCH = 10;
/** Technical safety cap for the transform's pitch while a gesture stretches the tilt (MapLibre allows 85); the log stretch never gets near it. */
export const STRETCH_PITCH_CEILING = 85;
/** Release animation back onto the limit (ms, ease-out). */
export const REBOUND_MS = 400;

/** Overshoot (degrees) below which the release sets the value directly instead of animating. */
export const REBOUND_SNAP_BELOW = 0.5;
/** Shortest release animation (ms) for a small overshoot. */
export const REBOUND_MIN_MS = 180;
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
/** Release duration for an overshoot of `excess` degrees: REBOUND_MS from `full` degrees on, proportionally shorter below, at least REBOUND_MIN_MS. */
export const reboundDuration = (excess: number, full = 12) => Math.round(Math.max(REBOUND_MIN_MS, Math.min(REBOUND_MS, (REBOUND_MS * Math.abs(excess)) / full)));
/** Remaining overshoot after `elapsed` ms of a release that started with `excess0` (ease-out cubic; 0 at the end). */
export const reboundExcess = (excess0: number, elapsed: number, duration: number) => (elapsed >= duration ? 0 : excess0 * (1 - easeOutCubic(Math.max(0, elapsed) / duration)));

/** Bearing normalised to (-180, 180]. */
export const wrapBearing = (b: number) => {
  const w = ((((b + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
};

/** True when a rotation at this zoom should ease back to north. */
export const needsNorthReset = (zoom: number, bearing: number) => zoom < NORTH_MAX_ZOOM && Math.abs(wrapBearing(bearing)) > 0.5;

/** Camera values as the limits allow them (URL on load, state written from outside): pitch clamped, north-up when zoomed out. */
export function clampCamera<T extends { zoom: number; pitch: number; bearing: number }>(c: T): T {
  return { ...c, pitch: clampPitch(c.zoom, c.pitch), bearing: c.zoom < NORTH_MAX_ZOOM ? 0 : c.bearing };
}

const EASING = { linear: (p: number) => p, out: (p: number) => 1 - (1 - p) * (1 - p) };

/** `cover`: px at the bottom edge that something lies over (the phone sheet); targets come to rest above it. */
export function flyToTarget(ml: MlMap, t: CameraTarget, basePadding: Padding, cover = 0): void {
  const padding = { ...basePadding, ...t.padding };
  const hidden = cover ? Math.min(cover, ml.getContainer().clientHeight / 2) : 0;
  const duration = t.duration ?? 1200;
  const easing = t.easing ? { easing: EASING[t.easing] } : {};
  if (t.bounds) {
    const [w, s, e, n] = t.bounds;
    ml.fitBounds([[w, s], [e, n]], { padding: { ...padding, bottom: padding.bottom + hidden }, duration, maxZoom: t.maxZoom ?? 16, bearing: t.bearing ?? ml.getBearing(), pitch: t.pitch ?? ml.getPitch(), ...easing });
    return;
  }
  const opts = {
    center: t.center,
    zoom: t.maxZoom !== undefined && t.zoom !== undefined ? Math.min(t.zoom, t.maxZoom) : t.zoom,
    bearing: t.bearing,
    pitch: t.pitch,
    padding,
    essential: true,
    // an offset, unlike a padding, leaves the camera of the map as it is; without a target there is nothing to move up
    ...(hidden && t.center ? { offset: [0, -hidden / 2] as [number, number] } : {}),
    ...easing,
  };
  if (duration === 0 && opts.offset) ml.easeTo({ ...opts, duration: 0 });
  else if (duration === 0) ml.jumpTo(opts);
  else ml.flyTo({ ...opts, duration });
}

export interface Located { lng: number; lat: number; accuracy: number }

export function locate(): Promise<Located> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Standort wird nicht unterstützt'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lng: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Standortzugriff verweigert' : 'Standort nicht verfügbar')),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
