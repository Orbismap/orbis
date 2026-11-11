// Slot marker layers. A slot is the stretch of the layer stack just below its marker:
//   [basemap] → field → raster → (terminator) → areas → lines → (basemap labels) → points → labels → top
import type { LayerSpecification } from 'maplibre-gl';
import type { SlotId } from './types';

/** Order of markers from bottom to top. 'terminator' and 'basemap-labels' are internal stretches. */
export const MARKERS = ['field', 'raster', 'terminator', 'areas', 'lines', 'basemap-labels', 'points', 'labels', 'top'] as const;
export type MarkerId = (typeof MARKERS)[number];

export const markerLayerId = (m: MarkerId) => `slot:${m}`;

export function slotMarkerLayers(): LayerSpecification[] {
  return MARKERS.map((m) => ({ id: markerLayerId(m), type: 'background', layout: { visibility: 'none' } }) as LayerSpecification);
}

/**
 * Layer id to pass as `beforeId` so that a new layer ends up on top of the others of its slot,
 * below the next slot. The marker of a slot sits above all of its layers.
 */
export const beforeIdFor = (slot: SlotId | 'terminator' | 'basemap-labels'): string => markerLayerId(slot as MarkerId);
