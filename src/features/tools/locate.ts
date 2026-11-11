import { computed, signal } from '@preact/signals';
import type { Feature } from 'geojson';
import { mapEngine } from '../../state/ui';
import { toast } from '../../ui/toast';
import { mountOverlay } from '../shared/overlay';

export const userPos = signal<{ lng: number; lat: number; accuracy: number } | null>(null);
export const locating = signal(false);

export async function locateMe(): Promise<void> {
  const engine = mapEngine.peek();
  if (!engine || locating.peek()) return;
  locating.value = true;
  try {
    userPos.value = await engine.locate();
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Standort nicht verfügbar', { kind: 'error' });
  } finally {
    locating.value = false;
  }
}

const feature = computed<Feature | null>(() => {
  const p = userPos.value;
  return p ? { type: 'Feature', properties: { acc: p.accuracy, lat: p.lat }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } } : null;
});

/** Position dot with accuracy circle on the map. */
export function startLocateOverlay(): () => void {
  return mountOverlay('me', feature, (s) => {
    const p = userPos.peek();
    const px = p ? p.accuracy / (0.075 * Math.max(0.05, Math.cos((p.lat * Math.PI) / 180))) : 0;
    return [
      { id: 'ui-me-acc', type: 'circle', source: s, paint: { 'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, 0, 20, px], 'circle-color': '#72c8f0', 'circle-opacity': 0.14, 'circle-stroke-color': '#72c8f0', 'circle-stroke-opacity': 0.5, 'circle-stroke-width': 1, 'circle-pitch-alignment': 'map' } },
      { id: 'ui-me-dot', type: 'circle', source: s, paint: { 'circle-radius': 6.5, 'circle-color': '#3aa5e0', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 } },
    ];
  });
}
