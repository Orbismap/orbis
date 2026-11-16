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

/** OpenStreetMap: position and zoom (the website has no rotation or tilt). */
export function osmUrl(cam: CameraState): string {
  const zoom = Math.max(0, Math.min(19, Math.round(cam.zoom)));
  return `https://www.openstreetmap.org/#map=${zoom}/${cam.lat.toFixed(5)}/${cam.lng.toFixed(5)}`;
}

/** Best-effort Google Maps URL (satellite 3D view) carrying rotation and tilt via the (undocumented) camera path. */
export function googleMaps3dUrl(cam: CameraState): string {
  const distance = zoomToDistance(cam.zoom, cam.lat);
  const tilt = Math.max(0, Math.min(67.5, cam.pitch));
  return `https://www.google.com/maps/@${cam.lat},${cam.lng},${distance}a,20y,${Math.round(cam.bearing)}h,${tilt.toFixed(1)}t/data=!3m1!1e3`;
}