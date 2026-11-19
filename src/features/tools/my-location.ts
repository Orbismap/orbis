import { computed, signal } from '@preact/signals';
import type { Feature } from 'geojson';
import { mapEngine } from '../../state/ui';
import { toast } from '../../ui/toast';
import { mountOverlay } from '../shared/overlay';

/** Last known own position; shown as a blue dot once the user asked for it. */
const myLocation = signal<{ lng: number; lat: number } | null>(null);

const point = computed<Feature | null>(() => {
  const p = myLocation.value;
  return p ? { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } } : null;
});

/** Flies to the own position and marks it. */
export function goToMyLocation(): void {
  mapEngine
    .peek()
    ?.locate()
    .then((p) => (myLocation.value = { lng: p.lng, lat: p.lat }))
    .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Standort nicht verfügbar', { kind: 'error' }));
}

/** Blue dot with white ring and soft shadow on the own position. */
export function startMyLocationMarker(): () => void {
  return mountOverlay('my-location', point, (s) => [
    { id: 'ui-my-location-ring', type: 'circle', source: s, paint: { 'circle-radius': 10, 'circle-color': '#ffffff', 'circle-stroke-color': 'rgba(10,15,24,0.35)', 'circle-stroke-width': 2, 'circle-pitch-alignment': 'map' } },
    { id: 'ui-my-location-dot', type: 'circle', source: s, paint: { 'circle-radius': 7, 'circle-color': '#2b8cf0', 'circle-pitch-alignment': 'map' } },
  ]);
}
