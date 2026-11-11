// Camera state. map/engine.ts writes it (throttled, ~10 Hz) and applies changes made from outside.
import { signal } from '@preact/signals';
import type { BBox } from '../core/geo';

export interface CameraState { lng: number; lat: number; zoom: number; bearing: number; pitch: number }
export type Projection = 'globe' | 'mercator';
export interface Padding { top: number; right: number; bottom: number; left: number }
export interface Viewport { bounds: BBox; width: number; height: number }

export const DEFAULT_CAMERA: CameraState = { lng: 10, lat: 30, zoom: 1.6, bearing: 0, pitch: 0 };

export const camera = signal<CameraState>({ ...DEFAULT_CAMERA });
export const projection = signal<Projection>('globe');
/** Visible bounds and size in px; undefined before the map is ready. */
export const viewport = signal<Viewport | undefined>(undefined);
/** Area of the map covered by panels/sheet; the camera keeps targets inside the rest. */
export const padding = signal<Padding>({ top: 0, right: 0, bottom: 0, left: 0 });

/** Moves the map from outside (URL, search, buttons). Engine applies it without echoing it back. */
export function setCamera(patch: Partial<CameraState>): void {
  camera.value = { ...camera.value, ...patch };
}
export const setProjection = (p: Projection) => {
  projection.value = p;
};
export const setPadding = (p: Partial<Padding>) => {
  padding.value = { ...padding.value, ...p };
};
