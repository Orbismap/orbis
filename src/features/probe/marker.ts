import { computed } from '@preact/signals';
import type { Feature } from 'geojson';
import { probe } from '../../state/selection';
import { mountOverlay } from '../shared/overlay';

const point = computed<Feature | null>(() => {
  const p = probe.value;
  return p ? { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } } : null;
});

/** Crosshair-style target on the probed point: ink halo, white ring, centre dot. */
export function startProbeMarker(): () => void {
  return mountOverlay('probe', point, (s) => [
    { id: 'ui-probe-halo', type: 'circle', source: s, paint: { 'circle-radius': 13, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': 'rgba(10,15,24,0.55)', 'circle-stroke-width': 4, 'circle-pitch-alignment': 'map' } },
    { id: 'ui-probe-ring', type: 'circle', source: s, paint: { 'circle-radius': 12, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5, 'circle-pitch-alignment': 'map' } },
    { id: 'ui-probe-dot', type: 'circle', source: s, paint: { 'circle-radius': 2.5, 'circle-color': '#ffffff', 'circle-stroke-color': 'rgba(10,15,24,0.6)', 'circle-stroke-width': 1, 'circle-pitch-alignment': 'map' } },
  ]);
}
