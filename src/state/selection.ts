// What the user picked on the map: an inspector card or a probe point.
import { batch, signal } from '@preact/signals';
import type { InspectCard } from '../layers/types';

export interface Inspected { layerId: string; card: InspectCard }
export const inspector = signal<Inspected | null>(null);
/** Point query: empty-map click. */
export const probe = signal<{ lng: number; lat: number } | null>(null);

/** A searched place (desktop detail menu). It also sets the point query, so the marker and field values come for free. */
export interface PlaceSel { id: string; title: string; subtitle: string; lng: number; lat: number; kind?: string }
export const place = signal<PlaceSel | null>(null);
export function selectPlace(p: PlaceSel): void {
  batch(() => {
    inspector.value = null;
    place.value = p;
    probe.value = { lng: p.lng, lat: p.lat };
  });
}

export function selectCard(layerId: string, card: InspectCard | null): void {
  inspector.value = card ? { layerId, card } : null;
  if (card) (probe.value = null, (place.value = null));
}
export function setProbe(p: { lng: number; lat: number } | null): void {
  probe.value = p;
  place.value = null;
  if (p) inspector.value = null;
}
export function clearSelection(): void {
  inspector.value = null;
  probe.value = null;
  place.value = null;
}
