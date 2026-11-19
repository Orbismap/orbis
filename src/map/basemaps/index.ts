// Basemap registry and the composed base style (all basemaps present, one visible).
import type { LayerSpecification, SkySpecification, SourceSpecification, StyleSpecification } from 'maplibre-gl';
import { MARKERS, markerLayerId } from '../slots';
import type { BasemapId, StaticBasemapId } from '../types';
import { canonicalRegionalId, isRegionalId, regionalDef } from './regional';
import { blank, bluemarble, nachtlichter, cyclosm, EOX_YEARS, eox, oepnv, osmDe, osmFr, wikimedia, esriDarkGray, esriHillshade, esriLightGray, esriNatgeo, esriNavigation, esriOcean, esriPhysical, esriShadedRelief, esriStreets, esriTerrain, esriTopo, osmHot, esriClarity, imagicoAlps, osm, satellite, swissalti3d, swissimage, swisssurface3d, terrain } from './raster';
import type { BasemapDef, LabelVariant } from './types';
import { BUILDING_BASE, BUILDING_FILTER, BUILDING_HEIGHT } from '../buildings-tilt';
import { DEM_NATIVE_ZOOM, DEM_TILES } from '../dem-protocol';
import { karteBasemap } from './karte';
import { keyedBasemaps, keyedGroups, type KeyedBasemapId } from './keyed';
import { LABEL_VARIANTS, OFM_GLYPHS, OFM_SOURCE, labelLayers, vectorBasemap } from './vector';

export type { BasemapId, StaticBasemapId } from '../types';
export type { BasemapDef, LabelVariant } from './types';

/**
 * Global basemaps in picker order. A group without `key` is a category: the picker shows one tab; the first id is its best map. A group with `key` is a provider that needs the user's own key.
 */
export interface BasemapGroup {
  title: string;
  /** shorter name for the tab */
  short?: string;
  ids: StaticBasemapId[];
  /** optional subheadings within the group (the ids are the same, in the same order) */
  sections?: { title: string; ids: StaticBasemapId[] }[];
  /** id of the key the group needs (providers with the user's own key) */
  key?: string;
}
/**
 * Maps of one provider that differ only by date: the picker shows one tile (label with the years) and, while one of them is active,
 * a slider for the year. `ids` are newest first, `years` run alongside.
 */
export interface BasemapSeries { label: string; ids: StaticBasemapId[]; years: number[] }
export const BASEMAP_SERIES: BasemapSeries[] = [
  { label: 'Sentinel-2', ids: EOX_YEARS.map((y) => `eox-${y}` as const), years: [...EOX_YEARS] },
];
export const seriesOf = (id: string): BasemapSeries | undefined => BASEMAP_SERIES.find((s) => (s.ids as string[]).includes(id));
const withSections = (title: string, sections: NonNullable<BasemapGroup['sections']>): BasemapGroup => ({ title, ids: sections.flatMap((x) => x.ids), sections });
export const BASEMAP_GROUPS: BasemapGroup[] = [
  { title: 'Orbis', ids: ['orbis-dark', 'orbis-light', 'orbis-karte'] },
  { title: 'OpenStreetMap', short: 'OSM', ids: ['osm', 'osm-hot', 'osm-fr', 'osm-de', 'wikimedia', 'cyclosm', 'oepnv', 'terrain'] },
  withSections('Esri', [
    { title: 'Luftbilder', ids: ['satellite', 'esri-clarity'] },
    { title: 'Karten', ids: ['esri-streets', 'esri-topo', 'esri-natgeo', 'esri-light-gray', 'esri-dark-gray'] },
    { title: 'Relief und Meer', ids: ['esri-terrain', 'esri-shaded-relief', 'esri-physical', 'esri-hillshade', 'esri-ocean', 'esri-navigation'] },
  ]),
  withSections('Mehr', [
    { title: 'Sentinel-2 (EOX)', ids: EOX_YEARS.map((y) => `eox-${y}` as const) },
    { title: 'Weitere', ids: ['bluemarble', 'nachtlichter', 'blank'] },
  ]),
  ...keyedGroups().map(({ provider, ids }): BasemapGroup => ({ title: provider.title, ids, key: provider.key })),
];
/** Hand-written regional basemaps (offered in the regional list, not in the grid). More come from regional.ts. */
export const STATIC_REGIONAL_IDS: StaticBasemapId[] = ['swissimage', 'imagico-alps', 'swissalti3d', 'swisssurface3d'];
/** Every static basemap (all of them are part of the composed style, hidden). */
export const BASEMAP_IDS: StaticBasemapId[] = [...BASEMAP_GROUPS.flatMap((g) => g.ids), ...STATIC_REGIONAL_IDS];
export const DEFAULT_BASEMAP: StaticBasemapId = 'orbis-dark';

export const BASEMAPS: Record<StaticBasemapId, BasemapDef> = {
  'orbis-dark': vectorBasemap('dark'),
  'orbis-light': vectorBasemap('light'),
  'orbis-karte': karteBasemap(),
  satellite: satellite(),
  'esri-clarity': esriClarity(),
  swissimage: swissimage(),
  'imagico-alps': imagicoAlps(),
  bluemarble: bluemarble(),
  nachtlichter: nachtlichter(),
  osm: osm(),
  'osm-fr': osmFr(),
  'osm-de': osmDe(),
  wikimedia: wikimedia(),
  cyclosm: cyclosm(),
  oepnv: oepnv(),
  'eox-2025': eox(2025),
  'eox-2024': eox(2024),
  'eox-2023': eox(2023),
  'eox-2022': eox(2022),
  'eox-2021': eox(2021),
  'eox-2020': eox(2020),
  'eox-2019': eox(2019),
  'eox-2018': eox(2018),
  'eox-2017': eox(2017),
  terrain: terrain(),
  'osm-hot': osmHot(),
  'esri-streets': esriStreets(),
  'esri-topo': esriTopo(),
  'esri-natgeo': esriNatgeo(),
  'esri-terrain': esriTerrain(),
  'esri-shaded-relief': esriShadedRelief(),
  'esri-physical': esriPhysical(),
  'esri-hillshade': esriHillshade(),
  'esri-ocean': esriOcean(),
  'esri-navigation': esriNavigation(),
  'esri-dark-gray': esriDarkGray(),
  'esri-light-gray': esriLightGray(),
  swissalti3d: swissalti3d(),
  swisssurface3d: swisssurface3d(),
  blank: blank(),
  ...(keyedBasemaps() as Record<KeyedBasemapId, BasemapDef>),
};

/** Raster basemaps whose tiles show place names already (the keyed ones are marked in keyed.ts, the regional ones in regional.ts). */
const OWN_LABELS: StaticBasemapId[] = ['osm', 'osm-hot', 'osm-fr', 'osm-de', 'wikimedia', 'cyclosm', 'oepnv', 'terrain', 'esri-streets', 'esri-topo', 'esri-natgeo', 'esri-navigation', 'esri-light-gray', 'esri-dark-gray'];
for (const id of OWN_LABELS) BASEMAPS[id].ownLabels = true;

export const isStaticBasemap = (v: unknown): v is StaticBasemapId => typeof v === 'string' && Object.hasOwn(BASEMAPS, v);
/** Static ids and the generated regional ids (valid before the regional data has loaded). */
export const isBasemapId = (v: unknown): v is BasemapId => isStaticBasemap(v) || isRegionalId(v);
/** The valid id for `v` (ids of merged yearly editions map to their series), or undefined. */
export const resolveBasemapId = (v: unknown): BasemapId | undefined =>
  isStaticBasemap(v) ? v : isRegionalId(v) ? (canonicalRegionalId(v) as BasemapId) : undefined;
/** Definition of any basemap; a regional one whose data has not loaded yet shows as the default. */
export const basemapDef = (id: BasemapId): BasemapDef => (isStaticBasemap(id) ? BASEMAPS[id] : regionalDef(id)) ?? BASEMAPS[DEFAULT_BASEMAP];

/** Fog and horizon colour of the flat map per theme (the sky blends from the fog colour into the horizon colour, see skyFor). */
const FOG_LOOK = { dark: { fog: '#0A0F18', horizon: '#4aa3d6' }, light: { fog: '#F4F6F9', horizon: '#d7e6f4' } } as const;

/** Atmosphere of the globe: a thin blue limb glow on the dark space (dark) or a soft haze (light). */
export function skyFor(theme: 'dark' | 'light'): SkySpecification {
  const blend: SkySpecification['atmosphere-blend'] = ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0];
  // MapLibre draws the globe until zoom 12 and then switches to the flat map; only the flat map has a sky, which would pop up at once
  // at zoom 12. It is blended in instead: the sky starts as the fog colour (invisible) and turns blue over two zoom steps. The sky
  // colours do not matter on the globe between zoom 7 and 12. No ground fog (1 = it never starts): it veils only the terrain, never the
  // 2.5D buildings, which looked worse than the plain edge.
  const groundFog: SkySpecification['fog-ground-blend'] = 1;
  const fade = (fog: string, sky: string): SkySpecification['sky-color'] => ['interpolate', ['linear'], ['zoom'], 5, sky, 7, fog, 12, fog, 14, sky];
  return theme === 'dark'
    ? { 'sky-color': fade(FOG_LOOK.dark.fog, '#16486f'), 'horizon-color': fade(FOG_LOOK.dark.fog, FOG_LOOK.dark.horizon), 'fog-color': FOG_LOOK.dark.fog, 'sky-horizon-blend': 0.35, 'horizon-fog-blend': 0.5, 'fog-ground-blend': groundFog, 'atmosphere-blend': blend }
    : { 'sky-color': fade(FOG_LOOK.light.fog, '#9cc3e4'), 'horizon-color': fade(FOG_LOOK.light.fog, FOG_LOOK.light.horizon), 'fog-color': FOG_LOOK.light.fog, 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.5, 'fog-ground-blend': groundFog, 'atmosphere-blend': blend };
}

const vis = (on: boolean) => ({ visibility: on ? ('visible' as const) : ('none' as const) });

export const TERRAIN_SOURCE = 'terrain-dem';
/** The relief shading reads the same tiles from a source of its own (MapLibre warns when it shares the 3D terrain's source). */
export const HILLSHADE_SOURCE = 'terrain-dem-shade';
export const HILLSHADE_LAYER = 'terrain-hillshade';
export const TERRAIN_EXAGGERATION = 1;
export const HILLSHADE_STRENGTH = 0.35;
export const TERRAIN_ATTRIBUTION = 'Gelände: <a href="https://mapterhorn.com/attribution/" target="_blank" rel="noopener">Mapterhorn</a>';
/** The terrain spec for the relief shading: the same tiles, without the attribution again. */
const hillshadeSpec = (): SourceSpecification => {
  const { attribution: _attribution, ...rest } = TERRAIN_SPEC as SourceSpecification & { attribution?: string };
  return rest as SourceSpecification;
};
export const TERRAIN_SPEC: SourceSpecification = { type: 'raster-dem', tiles: [DEM_TILES], tileSize: 512, maxzoom: DEM_NATIVE_ZOOM, encoding: 'terrarium', attribution: TERRAIN_ATTRIBUTION };

export interface StyleOptions { basemap: BasemapId; labels: boolean; terminator: boolean; projection: 'globe' | 'mercator'; /** 2.5D buildings, default true */ buildings?: boolean }

/** The 2.5D buildings for every basemap that has none of its own (aerial images, OSM, terrain, regional); the Orbis ones bring theirs. */
export const GENERIC_BUILDINGS_ID = 'bm-buildings';
const GENERIC_BUILDINGS_COLOR = '#d6dae3';
const genericBuildings = (visible: boolean): LayerSpecification => ({
  id: GENERIC_BUILDINGS_ID, type: 'fill-extrusion', source: 'ofm', 'source-layer': 'building', minzoom: 13.5, filter: BUILDING_FILTER,
  layout: { visibility: visible ? 'visible' : 'none', 'fill-extrusion-rounded-corner-distance': 1.5 },
  paint: {
    'fill-extrusion-color': GENERIC_BUILDINGS_COLOR,
    'fill-extrusion-height': BUILDING_HEIGHT,
    'fill-extrusion-base': BUILDING_BASE,
    'fill-extrusion-opacity': 0.85,
    'fill-extrusion-vertical-gradient': true,
  },
} as LayerSpecification);
/** Aerial images: the real 3D buildings (streamed 3D tiles, Orbis Pro) belong here, not the 2.5D ones. */
export const hasTiles3d = (id: string | undefined): boolean => id === 'satellite' || id === 'esri-clarity';
/** Does this basemap draw 2.5D buildings of its own? */
export const hasOwnBuildings = (id: string | undefined): boolean => !!id && id.startsWith('orbis-');

/**
 * Complete style: every basemap and label variant is part of it (hidden), slot markers and the terminator
 * layers sit in their final positions. Switching basemaps only flips visibility, so nothing the layers added
 * to the map is ever lost.
 */
export function composeStyle(o: StyleOptions): StyleSpecification {
  const sources: Record<string, SourceSpecification> = {
    ofm: OFM_SOURCE,
    [TERRAIN_SOURCE]: TERRAIN_SPEC,
    [HILLSHADE_SOURCE]: hillshadeSpec(),
  };
  const layers: LayerSpecification[] = [];
  const shown = isStaticBasemap(o.basemap) ? o.basemap : DEFAULT_BASEMAP; // regional ones are added by the engine once their data is loaded
  for (const id of BASEMAP_IDS) {
    const b = BASEMAPS[id];
    Object.assign(sources, b.sources);
    for (const l of b.layers) layers.push({ ...l, layout: { ...(l.layout ?? {}), ...vis(id === shown) } } as LayerSpecification);
  }
  // relief shading for the flat Orbis colours; only shown while 3D terrain is on (every basemap but the aerial images)
  layers.push({
    id: HILLSHADE_LAYER, type: 'hillshade', source: HILLSHADE_SOURCE, layout: { visibility: 'none' },
    paint: { 'hillshade-exaggeration': 0, 'hillshade-shadow-color': 'rgba(8, 12, 22, 0.55)', 'hillshade-highlight-color': 'rgba(255, 255, 255, 0.18)', 'hillshade-accent-color': 'rgba(8, 12, 22, 0.25)' },
  } as LayerSpecification);
  const active = BASEMAPS[shown].labelVariant;
  const labelsOn = o.labels && !BASEMAPS[shown].ownLabels;
  const marker = (m: (typeof MARKERS)[number]) => ({ id: markerLayerId(m), type: 'background', layout: { visibility: 'none' } }) as LayerSpecification;
  for (const m of ['field', 'raster'] as const) layers.push(marker(m));
  for (const m of ['terminator', 'areas', 'lines'] as const) layers.push(marker(m));
  const buildings = o.buildings !== false;
  for (const id of BASEMAP_IDS) for (const l of BASEMAPS[id].topLayers ?? []) layers.push({ ...l, layout: { ...(l.layout ?? {}), ...vis(buildings && id === shown) } } as LayerSpecification);
  layers.push(genericBuildings(buildings && !hasOwnBuildings(shown) && !hasTiles3d(shown)));
  for (const v of LABEL_VARIANTS) for (const l of labelLayers(v)) layers.push({ ...l, layout: { ...(l.layout ?? {}), ...vis(labelsOn && v === active) } } as LayerSpecification);
  for (const m of ['basemap-labels', 'points', 'labels', 'top'] as const) layers.push(marker(m));
  return {
    version: 8,
    projection: { type: o.projection },
    glyphs: OFM_GLYPHS,
    sky: skyFor(BASEMAPS[shown].theme === 'light' ? 'light' : 'dark'),
    sources,
    layers,
  };
}

export const labelLayerIds = (v: LabelVariant): string[] => labelLayers(v).map((l) => l.id);
