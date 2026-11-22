// The ground that counts in a view. A tilted camera sees to the horizon, hundreds of kilometres of tiles whose houses and places are a few pixels
// big; `getBounds()` covers all of it. What the renderers (places, buildings) work on is a square around the map centre that is REACH times the
// canvas wide at the centre's scale: a flat view lies inside it, a steep one is cut to it.
import type { Map as MlMap } from 'maplibre-gl';

/** Edge of the square in canvases (at the scale of the map centre). */
export const REACH = 1.2;
/** metres per degree of latitude */
export const M_PER_DEG_LAT = 111_320;
/** [west, south, east, north] in degrees */
export type Box = [number, number, number, number];

/** The view's bounds, cut to the reach (see above). */
export function reachBox(ml: MlMap): Box {
  const b = ml.getBounds();
  const c = ml.getCenter();
  const cos = Math.cos((c.lat * Math.PI) / 180);
  const cv = ml.getCanvas();
  const half = (REACH * Math.max(cv.clientWidth, cv.clientHeight) * 40_075_016.686 * cos) / (512 * 2 ** ml.getZoom()) / 2;
  const dLat = half / M_PER_DEG_LAT;
  const dLng = half / (M_PER_DEG_LAT * Math.max(cos, 0.01));
  return [Math.max(b.getWest(), c.lng - dLng), Math.max(b.getSouth(), c.lat - dLat), Math.min(b.getEast(), c.lng + dLng), Math.min(b.getNorth(), c.lat + dLat)];
}

/** Is `inner` inside `outer`? */
export const boxInside = (outer: Box, inner: Box) => inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
