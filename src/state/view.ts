// Camera state. map/engine.ts writes it (throttled, ~10 Hz) and applies changes made from outside.
import { signal } from '@preact/signals';
import type { BBox } from '../core/geo';
import { DEFAULT_KARTE_MODE, type KarteMode } from '../map/basemaps';

export interface CameraState { lng: number; lat: number; zoom: number; bearing: number; pitch: number }
export type Projection = 'globe' | 'mercator';
export interface Padding { top: number; right: number; bottom: number; left: number }
export interface Viewport { bounds: BBox; width: number; height: number }

export const DEFAULT_CAMERA: CameraState = { lng: 10, lat: 30, zoom: 1.6, bearing: 0, pitch: 0 };

export const camera = signal<CameraState>({ ...DEFAULT_CAMERA });
export const projection = signal<Projection>('globe');
/** The basemap on show (set by the map engine). */
export const activeBasemap = signal<string>('');
/** The switch "3D-Gebäude" of the basemap popover: plain OSM 2.5D buildings, and the Cesium 3D tiles on aerial images (Orbis Pro). Plateau and the coloured OSM buildings belong to the layer "3D-Gebäude". Not persisted. */
export const buildings3d = signal(true);
/** The switch "Orte" of the basemap popover: shops, food, stations ... of the Erkunden map, by importance for the zoom (map/poi.ts). Not persisted. */
export const poiBasemap = signal(true);
/** The layer "Orte und Läden" is on: it draws the places itself (with its filter), the basemap's own step aside. Written by the layer. */
export const poiLayerOn = signal(false);
/** Place labels are on (basemap POIs in "Erkunden" or the layer "Orte und Läden"): the Pro landmark badges follow this. Written by the map engine. */
export const poiLabelsVisible = signal(false);
export const setBuildings3d = (on: boolean) => {
  buildings3d.value = on;
};
/**
 * Mode of the plain maps in the basemap picker: Daten (bare map), Erkunden (terrain and 2.5D buildings), Fahren (traffic; for now like Daten).
 * Aerial images always show the relief, whatever the mode is. Not persisted.
 */
export const karteMode = signal<KarteMode>(DEFAULT_KARTE_MODE);
/** The layer "3D-Gebäude" replaces the 2.5D buildings of the basemap (coloured OSM buildings, or real models in view): they go off whatever the switch says. Written by the layer. */
export const buildingsReplaced = signal(false);
/** The basemap shown is a dark one (its `theme`): 3D landmarks light their windows then. Written by the map engine. */
export const mapDark = signal(false);
/** The layer "3D-Gebäude" (type OSM) is on: with Orbis Pro its buildings are drawn by Orbis' own 3D renderer in the close view (features/buildings3d/roofs-source.ts), with roofs and the colours of OSM. Written by the layer. */
export const buildingsDetailed = signal(false);
/** The layer "3D-Gebäude" draws its buildings in the colours OSM knows (option "Eingefärbt"); off: all in one plain colour, 2.5D and with Orbis Pro. Written by the layer. */
export const buildingsColoured = signal(false);
/** The layer "3D-Gebäude" is switched on (any type). Written by the layer. */
export const buildingsLayerOn = signal(false);
/** The layer's type "Gebäude" wants the basemap's plain 2.5D buildings even where the Karte mode (Daten/Fahren) hides them. Written by the layer. */
export const buildingsPlainWanted = signal(false);
/** The colour the 2.5D buildings of the shown basemap have (dark on the dark map, light on the light one): buildings without a colour of their own get it, also with Orbis Pro. Written by the map engine. */
export const buildingColour = signal('#d6dae3');
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
