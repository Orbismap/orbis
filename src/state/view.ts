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
/** 3D terrain (real elevation model); on by default. Not persisted. */
/** The basemap on show (set by the map engine). */
export const activeBasemap = signal<string>('');
/** The switch "3D-Gebäude" of the basemap popover: plain OSM 2.5D buildings, and the Cesium 3D tiles on aerial images (Orbis Pro). Plateau and the coloured OSM buildings belong to the layer "3D-Gebäude". Not persisted. */
export const buildings3d = signal(true);
export const setBuildings3d = (on: boolean) => {
  buildings3d.value = on;
};
/** The layer "3D-Gebäude" replaces the 2.5D buildings of the basemap (coloured OSM buildings, or real models in view): they go off whatever the switch says. Written by the layer. */
export const buildingsReplaced = signal(false);
/** OpenFreeMap ids of the 2.5D buildings that Orbis Pro draws in 3D (roofs, parts): they are hidden, the rest stays. Written by `features/buildings3d/roofs-source.ts`. */
export const buildingsCovered = signal<readonly number[]>([]);
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
