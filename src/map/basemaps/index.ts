// Basemap registry and the composed base style (all basemaps present, one visible).
import type { LayerSpecification, SkySpecification, SourceSpecification, StyleSpecification } from 'maplibre-gl';
import { MARKERS, markerLayerId } from '../slots';
import type { BasemapId } from '../types';
import { bluemarble, satellite, terrain } from './raster';
import type { BasemapDef, LabelVariant } from './types';
import { LABEL_VARIANTS, OFM_GLYPHS, OFM_SOURCE, labelLayers, vectorBasemap } from './vector';

export type { BasemapId } from '../types';
export type { BasemapDef, LabelVariant } from './types';

export const BASEMAP_IDS: BasemapId[] = ['orbis-dark', 'orbis-light', 'satellite', 'terrain', 'bluemarble'];
export const DEFAULT_BASEMAP: BasemapId = 'orbis-dark';

export const BASEMAPS: Record<BasemapId, BasemapDef> = {
  'orbis-dark': vectorBasemap('dark'),
  'orbis-light': vectorBasemap('light'),
  satellite: satellite(),
  terrain: terrain(),
  bluemarble: bluemarble(),
};

export const isBasemapId = (v: unknown): v is BasemapId => typeof v === 'string' && v in BASEMAPS;


/** Atmosphere of the globe: a thin blue limb glow on the dark space (dark) or a soft haze (light). */
export function skyFor(theme: 'dark' | 'light'): SkySpecification {
  const blend: SkySpecification['atmosphere-blend'] = ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0];
  return theme === 'dark'
    ? { 'sky-color': '#16486f', 'horizon-color': '#4aa3d6', 'fog-color': '#0A0F18', 'sky-horizon-blend': 0.35, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.5, 'atmosphere-blend': blend }
    : { 'sky-color': '#9cc3e4', 'horizon-color': '#d7e6f4', 'fog-color': '#F4F6F9', 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.5, 'atmosphere-blend': blend };
}

const vis = (on: boolean) => ({ visibility: on ? ('visible' as const) : ('none' as const) });

export interface StyleOptions { basemap: BasemapId; labels: boolean; terminator: boolean; projection: 'globe' | 'mercator' }

/**
 * Complete style: every basemap and label variant is part of it (hidden), slot markers and the terminator
 * layers sit in their final positions. Switching basemaps only flips visibility, so nothing the layers added
 * to the map is ever lost.
 */
export function composeStyle(o: StyleOptions): StyleSpecification {
  const sources: Record<string, SourceSpecification> = {
    ofm: OFM_SOURCE,
  };
  const layers: LayerSpecification[] = [];
  for (const id of BASEMAP_IDS) {
    const b = BASEMAPS[id];
    Object.assign(sources, b.sources);
    for (const l of b.layers) layers.push({ ...l, layout: { ...(l.layout ?? {}), ...vis(id === o.basemap) } } as LayerSpecification);
  }
  const active = BASEMAPS[o.basemap].labelVariant;
  const marker = (m: (typeof MARKERS)[number]) => ({ id: markerLayerId(m), type: 'background', layout: { visibility: 'none' } }) as LayerSpecification;
  for (const m of ['field', 'raster'] as const) layers.push(marker(m));
  for (const m of ['terminator', 'areas', 'lines'] as const) layers.push(marker(m));
  for (const id of BASEMAP_IDS) for (const l of BASEMAPS[id].topLayers ?? []) layers.push({ ...l, layout: { ...(l.layout ?? {}), ...vis(id === o.basemap) } } as LayerSpecification);
  for (const v of LABEL_VARIANTS) for (const l of labelLayers(v)) layers.push({ ...l, layout: { ...(l.layout ?? {}), ...vis(o.labels && v === active) } } as LayerSpecification);
  for (const m of ['basemap-labels', 'points', 'labels', 'top'] as const) layers.push(marker(m));
  return {
    version: 8,
    projection: { type: o.projection },
    glyphs: OFM_GLYPHS,
    sky: skyFor(BASEMAPS[o.basemap].theme === 'light' ? 'light' : 'dark'),
    sources,
    layers,
  };
}

export const labelLayerIds = (v: LabelVariant): string[] => labelLayers(v).map((l) => l.id);
