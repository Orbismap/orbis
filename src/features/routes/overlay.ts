import { computed, effect } from '@preact/signals';
import type { FeatureCollection } from 'geojson';
import { routeChoice, routeState, stops } from '../../state/routes';
import { orteView } from '../../state/hud';
import { ensureIcons } from '../../render/icons';
import { mapEngine } from '../../state/ui';
import { mountOverlay } from '../shared/overlay';
import { camerasToFeatures, routeCameras } from './cameras';

const data = computed<FeatureCollection | null>(() => {
  if (orteView.value !== 'routes') return null;
  const list = stops.value;
  const st = routeState.value;
  const features: FeatureCollection['features'] = [];
  if (st.status === 'ok') {
    const c = routeChoice.value;
    // alternatives first (grey), the chosen route on top
    st.routes.forEach((r, i) => i !== c && features.push({ type: 'Feature', properties: { alt: true }, geometry: { type: 'LineString', coordinates: r.coords } }));
    const r = st.routes[c] ?? st.routes[0]!;
    features.push({ type: 'Feature', properties: { alt: false }, geometry: { type: 'LineString', coordinates: r.coords } });
  }
  features.push(...camerasToFeatures(routeCameras.value));
  list.forEach((s, i) => s && features.push({ type: 'Feature', properties: { role: i === 0 ? 'start' : i === list.length - 1 ? 'end' : 'via' }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } }));
  return features.length ? { type: 'FeatureCollection', features } : null;
});

const line = ['==', ['geometry-type'], 'LineString'] as const;
const pt = ['all', ['==', ['geometry-type'], 'Point'], ['!', ['has', 'cam']]] as const;
const cam = ['has', 'cam'] as const;
const roleColor = ['match', ['get', 'role'], 'start', '#3ecf8e', 'end', '#ff5d5d', '#ffffff'] as never;

/** Route line (halo + line) and the start, via and destination markers, while the planner is open. */
export function startRouteOverlay(): () => void {
  const stopIcons = effect(() => {
    const e = mapEngine.value;
    if (e) void e.ready.then(() => ensureIcons(e.ml, ['camera']));
  });
  const stopOverlay = mountOverlay('route', data, (s) => [
    { id: 'ui-route-halo', type: 'line', source: s, filter: line as never, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': 'rgba(10,15,24,0.6)', 'line-width': 9 } },
    { id: 'ui-route-line', type: 'line', source: s, filter: line as never, layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['case', ['get', 'alt'], 0, 1] }, paint: { 'line-color': ['case', ['get', 'alt'], '#8a97ab', '#4ea8ff'], 'line-width': 5.5 } },
    { id: 'ui-route-cam', type: 'circle', source: s, filter: cam as never, paint: { 'circle-radius': 13, 'circle-color': ['match', ['get', 'cam'], 'mobile', '#E5322D', '#FFB020'] as never, 'circle-stroke-color': '#0B1220', 'circle-stroke-width': 2, 'circle-pitch-alignment': 'map' } },
    { id: 'ui-route-cam-glyph', type: 'symbol', source: s, filter: cam as never, layout: { 'icon-image': 'camera', 'icon-size': 0.46, 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotation-alignment': 'viewport', 'icon-pitch-alignment': 'viewport' }, paint: { 'icon-color': '#ffffff', 'icon-halo-color': 'rgba(11,18,32,0.55)', 'icon-halo-width': 0.6 } },
    { id: 'ui-route-stop-halo', type: 'circle', source: s, filter: pt as never, paint: { 'circle-radius': 9, 'circle-color': 'rgba(10,15,24,0.55)', 'circle-pitch-alignment': 'map' } },
    { id: 'ui-route-stop', type: 'circle', source: s, filter: pt as never, paint: { 'circle-radius': 6.5, 'circle-color': roleColor, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2, 'circle-pitch-alignment': 'map' } },
  ]);
  return () => (stopIcons(), stopOverlay());
}
