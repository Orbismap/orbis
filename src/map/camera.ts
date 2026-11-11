// Camera helpers: flyTo with padding, geolocation.
import type { Map as MlMap } from 'maplibre-gl';
import type { Padding } from '../state/view';
import type { CameraTarget } from './types';

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
