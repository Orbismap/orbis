import type { CameraState } from '../../state/view';

/** Approximate MapLibre zoom level as a camera distance in metres for Apple Maps / Google Earth URLs. */
function zoomToDistance(zoom: number, lat: number): number {
  const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * Math.pow(2, zoom));
  // nominal viewport height; only affects the resulting scale, which external maps re-fit anyway
  const dist = mpp * 900 * 0.93;
  return Math.max(50, Math.round(dist));
}

/** Apple Maps unified URL (iOS 18.4+ / macOS 15.4+): centre, heading (rotation), pitch (tilt) and distance (zoom). */
export function appleMapsUrl(cam: CameraState): string {
  const p = new URLSearchParams();
  p.set('center', `${cam.lat},${cam.lng}`);
  p.set('heading', String(Math.round(cam.bearing)));
  p.set('pitch', String(Math.round(cam.pitch)));
  p.set('distance', String(zoomToDistance(cam.zoom, cam.lat)));
  p.set('map', 'explore');
  return `https://maps.apple.com/frame?${p.toString()}`;
}

/** Google Maps documented URL: position + zoom (+ basemap). Google's public URL scheme does not carry rotation/tilt for the normal map view. */
export function googleMapsUrl(cam: CameraState, basemap?: string): string {
  const p = new URLSearchParams();
  p.set('api', '1');
  p.set('map_action', 'map');
  p.set('center', `${cam.lat},${cam.lng}`);
  p.set('zoom', String(Math.max(0, Math.min(21, Math.round(cam.zoom)))));
  if (basemap === 'satellite') p.set('basemap', 'satellite');
  else if (basemap === 'terrain') p.set('basemap', 'terrain');
  return `https://www.google.com/maps/@?${p.toString()}`;
}

/** Best-effort Google Maps 3D/Earth URL carrying rotation and tilt via the (undocumented) camera path. */
export function googleMaps3dUrl(cam: CameraState): string {
  const distance = zoomToDistance(cam.zoom, cam.lat);
  const tilt = Math.max(0, Math.min(67.5, cam.pitch));
  return `https://www.google.com/maps/@${cam.lat},${cam.lng},${distance}a,20y,${Math.round(cam.bearing)}h,${tilt.toFixed(1)}t/data=!3m1!1e3`;
}