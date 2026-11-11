// What the user picked on the map: an inspector card or a probe point.
import { signal } from '@preact/signals';
import type { InspectCard } from '../layers/types';

export interface Inspected { layerId: string; card: InspectCard }
export const inspector = signal<Inspected | null>(null);
/** Point query: empty-map click. */
export const probe = signal<{ lng: number; lat: number } | null>(null);

export function selectCard(layerId: string, card: InspectCard | null): void {
  inspector.value = card ? { layerId, card } : null;
  if (card) probe.value = null;
}
export function setProbe(p: { lng: number; lat: number } | null): void {
  probe.value = p;
  if (p) inspector.value = null;
}
export function clearSelection(): void {
  inspector.value = null;
  probe.value = null;
}
