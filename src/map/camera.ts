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
 * Rubber band for a gesture that pulls past a limit (Apple-style stretch): up to `limit` the value follows the input 1:1
 * (slope 1, no kink), beyond it the excess is damped exponentially towards `limit + maxOver`, so the resistance grows with
 * the pull and the value never leaves that ceiling. Pure; the release animation brings it back to `limit`.
 */
export function rubberBand(raw: number, limit: number, maxOver: number): number {
  if (!(raw > limit) || !(maxOver > 0)) return raw;
  return limit + maxOver * (1 - Math.exp(-(raw - limit) / maxOver));
}

/** How far a tilt may be stretched past `limit` (degrees): a little when nearly flat, up to 12 deg when the limit is large. */
export const pitchStretch = (limit: number) => 3 + 0.3 * Math.min(30, Math.max(0, limit));
/** How far a rotation may be stretched against north (degrees) where north is enforced. */
export const BEARING_STRETCH = 30;
/** Highest pitch the transform may take while a gesture stretches the tilt (below MapLibre's own ceiling). */
export const STRETCH_PITCH_CEILING = 85;
/** Release animation back onto the limit (ms, ease-out). */
export const REBOUND_MS = 400;

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

export function flyToTarget(ml: MlMap, t: CameraTarget, basePadding: Padding): void {
  const padding = { ...basePadding, ...t.padding };
  const duration = t.duration ?? 1200;
  if (t.bounds) {
    const [w, s, e, n] = t.bounds;
    ml.fitBounds([[w, s], [e, n]], { padding, duration, maxZoom: t.maxZoom ?? 16, bearing: t.bearing ?? ml.getBearing(), pitch: t.pitch ?? ml.getPitch() });
    return;
  }
  const opts = {
    center: t.center,
    zoom: t.maxZoom !== undefined && t.zoom !== undefined ? Math.min(t.zoom, t.maxZoom) : t.zoom,
    bearing: t.bearing,
    pitch: t.pitch,
    padding,
    essential: true,
  };
  if (duration === 0) ml.jumpTo(opts);
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
