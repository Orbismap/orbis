// Public types of the map layer. Importable everywhere (type-only, no MapLibre at runtime).
import type { CustomLayerInterface, LayerSpecification, Map as MlMap, MapGeoJSONFeature, SourceSpecification } from 'maplibre-gl';
import type { BBox, LngLat } from '../core/geo';
import type { Padding } from '../state/view';

export type SlotId = 'field' | 'raster' | 'areas' | 'lines' | 'points' | 'labels' | 'top';
export type StaticBasemapId =
  | 'orbis-dark' | 'orbis-light'
  | 'satellite' | 'esri-clarity' | 'swissimage' | 'imagico-alps' | 'bluemarble'
  | 'osm' | 'terrain'
  | 'swissalti3d' | 'swisssurface3d'
  | 'blank';
/** Static basemaps plus the generated regional ones (`r-…`, see map/basemaps/regional.ts). */
export type BasemapId = StaticBasemapId | `r-${string}`;

export interface PickHandler {
  click?(feature: MapGeoJSONFeature, lngLat: LngLat): void;
  /** Called with the feature under the pointer, or null when it left. */
  hover?(feature: MapGeoJSONFeature | null): void;
}

export interface CameraTarget {
  center?: LngLat;
  zoom?: number;
  bearing?: number;
  pitch?: number;
  bounds?: BBox;
  padding?: Partial<Padding>;
  /** ms; 0 jumps. Default 1200 for flyTo. */
  duration?: number;
  maxZoom?: number;
}

export interface MapEngine {
  readonly ml: MlMap;                                         // only for render/ kits
  ready: Promise<void>;
  setBasemap(id: BasemapId): void;
  setProjection(p: 'globe' | 'mercator'): void;
  setLabels(on: boolean): void;
  /** 3D terrain from the elevation model (lifted only while the camera is tilted). */
  setTerminator(mode: 'off' | 'auto'): void;
  addSource(id: string, spec: SourceSpecification): void;     // idempotent
  addLayer(spec: LayerSpecification, slot: SlotId): void;     // inserts into the slot (on top of its other layers)
  addCustomLayer(layer: CustomLayerInterface, slot: SlotId): void;
  remove(ids: { layers?: string[]; sources?: string[] }): void;
  onPick(layerIds: string[], h: PickHandler): () => void;
  flyTo(target: CameraTarget): void;
  requestRender(): void;
  // additions to the original spec
  /** Moves an existing layer to the top of a slot. */
  moveToSlotTop(layerId: string, slot: SlotId): void;
  /** Panel/sheet padding; camera targets stay inside the remaining area. */
  setPadding(p: Partial<Padding>): void;
  getBasemap(): BasemapId;
  /** An extension steers pitch and bearing itself: the limits stand back until the returned function is called (see CameraLimits.hold). */
  holdCamera(): (ease?: { elevation: number }) => void;
  /** Browser geolocation, resolves the position and flies there. */
  locate(): Promise<{ lng: number; lat: number; accuracy: number }>;
}
