// Basemap registry and the composed base style (all basemaps present, one visible).
import type { LayerSpecification, SkySpecification, SourceSpecification, StyleSpecification } from 'maplibre-gl';
import { MARKERS, markerLayerId } from '../slots';
import type { BasemapId, StaticBasemapId } from '../types';
import { canonicalRegionalId, isRegionalId, regionalDef } from './regional';
import { blank, bluemarble, jahreszeiten, nachtlichter, cyclosm, EOX_YEARS, eox, oepnv, osmDe, osmFr, wikimedia, esriDarkGray, esriHillshade, esriLightGray, esriNatgeo, esriNavigation, esriOcean, esriPhysical, esriShadedRelief, esriStreets, esriTerrain, esriTopo, osmHot, esriClarity, imagicoAlps, osm, satellite, swissalti3d, swissimage, swisssurface3d, terrain } from './raster';
import type { BasemapDef, LabelVariant } from './types';
import { BUILDING_BASE, BUILDING_FILTER, BUILDING_HEIGHT } from '../buildings-tilt';
import { DEM_NATIVE_ZOOM, DEM_TILES } from '../dem-protocol';
import { karteBasemap } from './karte';
import { keyedBasemaps, keyedGroups, type KeyedBasemapId } from './keyed';
import { POI_GEO_SOURCE, POI_LAYER_ID, poiLayers } from '../poi';
import { LABEL_VARIANTS, OFM_BUILDINGS_SOURCE, OFM_BUILDINGS_SOURCE_ID, OFM_GLYPHS, OFM_SOURCE, labelLayers, vectorBasemap } from './vector';

export type { BasemapId, StaticBasemapId } from '../types';
export type { BasemapDef, LabelVariant } from './types';

/**
 * The modes of the picker (first row). The first three are the plain maps and differ only in what stands on them:
 * `daten` is the bare map (no terrain, no buildings), `erkunden` has terrain and 2.5D buildings, `fahren` is for traffic
 * (for now the same as `daten`; car, public transport, planes, ships come later). `luftbild` is every aerial image.
 */
export type MapMode = 'daten' | 'erkunden' | 'fahren' | 'luftbild';
/** The modes that show a plain map (what the user picks; `luftbild` follows from the basemap). */
export type KarteMode = Exclude<MapMode, 'luftbild'>;
export const MAP_MODES: { id: MapMode; label: string }[] = [
  { id: 'daten', label: 'Daten' },
  { id: 'erkunden', label: 'Erkunden' },
  { id: 'fahren', label: 'Fahren' },
  { id: 'luftbild', label: 'Satellit' },
];
export const DEFAULT_KARTE_MODE: KarteMode = 'erkunden';

/** Keyed providers' aerial images (the other keyed maps are plain maps). */
const KEYED_AERIAL: StaticBasemapId[] = ['mt-satellite', 'mt-hybrid', 'st-satellite', 'mb-satellite', 'mb-hybrid', 'here-satellite', 'here-hybrid'];
/** Every aerial image (the picker's Satellit list). */
const AERIAL_SET = new Set<string>([...['satellite', 'esri-clarity', 'bluemarble', 'jahreszeiten', 'nachtlichter'], ...EOX_YEARS.map((y) => `eox-${y}`), ...KEYED_AERIAL]);
/** A provider (or kind) of maps in the picker: the maps stand under its small heading. */
export interface BasemapGroup { title: string; ids: StaticBasemapId[] }
/** Keyed providers' maps of one kind (aerial or plain), as groups under the provider's name. */
const keyedByKind = (aerial: boolean): BasemapGroup[] =>
  keyedGroups().map((g) => ({ title: g.provider.title, ids: g.ids.filter((id) => AERIAL_SET.has(id) === aerial) as StaticBasemapId[] })).filter((g) => g.ids.length > 0);
/** Aerial images and satellite mosaics by provider, best first (the first map is what the mode Satellit opens). A series counts once in the picker. */
export const AERIAL_GROUPS: BasemapGroup[] = [
  { title: 'Esri', ids: ['satellite', 'esri-clarity'] },
  { title: 'Sentinel-2 (EOX)', ids: EOX_YEARS.map((y) => `eox-${y}` as const) },
  { title: 'Weitere', ids: ['jahreszeiten', 'bluemarble', 'nachtlichter'] },
  ...keyedByKind(true),
];
export const AERIAL_IDS: StaticBasemapId[] = AERIAL_GROUPS.flatMap((g) => g.ids);
export const isAerial = (id: string | undefined): boolean => !!id && AERIAL_SET.has(id);
/** Plain maps by provider, best first: Orbis, Esri, OpenStreetMap, the rest, and the maps of providers with the user's own key. */
export const KARTE_GROUPS: BasemapGroup[] = [
  { title: 'Orbis', ids: ['orbis-dark', 'orbis-light'] },
  { title: 'Esri', ids: ['esri-dark-gray', 'esri-light-gray', 'esri-streets', 'esri-topo', 'esri-natgeo', 'esri-navigation', 'esri-terrain', 'esri-shaded-relief', 'esri-physical', 'esri-hillshade', 'esri-ocean'] },
  { title: 'OpenStreetMap', ids: ['osm', 'osm-hot', 'osm-fr', 'osm-de', 'wikimedia', 'cyclosm', 'oepnv', 'terrain'] },
  { title: 'Weitere', ids: ['blank'] },
  ...keyedByKind(false),
];
export const KARTE_IDS: StaticBasemapId[] = KARTE_GROUPS.flatMap((g) => g.ids);
/** The single maps of the modes that have no list in Daten: Erkunden has its Orbis Karte, Fahren its own dark map. */
export const MODE_IDS: StaticBasemapId[] = ['orbis-karte', 'orbis-fahren'];
/** Picker mode a basemap belongs to; the mode itself is not in the URL, so a reload derives it from `b=`. */
export const modeForBasemap = (id: string | undefined): MapMode =>
  isAerial(id) ? 'luftbild' : id === 'orbis-karte' ? 'erkunden' : id === 'orbis-fahren' ? 'fahren' : 'daten';
/** Does the map show terrain and 2.5D buildings? Always on aerial images (the 3D tiles and the camera need the ground there). */
export const showsRelief = (mode: KarteMode, id: string | undefined): boolean => mode === 'erkunden' || isAerial(id);
/** Key (id of the user's key) a keyed basemap needs, or undefined for the free ones. */
export const keyOfBasemap = (id: string): string | undefined => keyedGroups().find((g) => (g.ids as string[]).includes(id))?.provider.key;
/** Hand-written regional basemaps (offered in the regional list, not in the grid). More come from regional.ts. */
export const STATIC_REGIONAL_IDS: StaticBasemapId[] = ['swissimage', 'imagico-alps', 'swissalti3d', 'swisssurface3d'];
/** Every static basemap (all of them are part of the composed style, hidden). */
export const BASEMAP_IDS: StaticBasemapId[] = [...KARTE_IDS, ...AERIAL_IDS, ...MODE_IDS, ...STATIC_REGIONAL_IDS];
export const DEFAULT_BASEMAP: StaticBasemapId = 'orbis-dark';

export const BASEMAPS: Record<StaticBasemapId, BasemapDef> = {
  'orbis-dark': vectorBasemap('dark'),
  'orbis-light': vectorBasemap('light'),
  'orbis-karte': karteBasemap(),
  'orbis-fahren': vectorBasemap('dark', { id: 'orbis-fahren', label: 'Orbis Fahren' }),
  satellite: satellite(),
  'esri-clarity': esriClarity(),
  swissimage: swissimage(),
  'imagico-alps': imagicoAlps(),
  bluemarble: bluemarble(),
  jahreszeiten: jahreszeiten(),
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

export interface StyleOptions { basemap: BasemapId; labels: boolean; terminator: boolean; projection: 'globe' | 'mercator'; /** 2.5D buildings, default true */ buildings?: boolean; /** places of interest (map/poi.ts), default off */ poi?: boolean }

/** The 2.5D buildings for every basemap that has none of its own (aerial images, OSM, terrain, regional); the Orbis ones bring theirs. */
export const GENERIC_BUILDINGS_ID = 'bm-buildings';
const GENERIC_BUILDINGS_COLOR = '#d6dae3';
const genericBuildings = (visible: boolean): LayerSpecification => ({
  id: GENERIC_BUILDINGS_ID, type: 'fill-extrusion', source: OFM_BUILDINGS_SOURCE_ID, 'source-layer': 'building', minzoom: 13.5, filter: BUILDING_FILTER,
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
/** The colour of the 2.5D buildings a basemap shows: its own, or the generic one. */
export function buildingColourOf(id: string | undefined): string {
  if (hasOwnBuildings(id)) {
    const c = (BASEMAPS[id as keyof typeof BASEMAPS]?.topLayers?.[0] as { paint?: Record<string, unknown> } | undefined)?.paint?.['fill-extrusion-color'];
    if (typeof c === 'string') return c;
  }
  return GENERIC_BUILDINGS_COLOR;
}
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
    [OFM_BUILDINGS_SOURCE_ID]: OFM_BUILDINGS_SOURCE,
    // tiles up to zoom 14 only, drawn larger further in: a tilted street view covers a quarter as many of them, and each one costs a layout,
    // an icon atlas upload and (with 3D terrain) its own cover test
    [POI_GEO_SOURCE]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'key', maxzoom: 14 },
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
  for (const m of ['basemap-labels', 'points'] as const) layers.push(marker(m));
  // above the points slot, where the 3D models (landmarks, buildings, trees) are drawn: they must not cover the places
  layers.push(...poiLayers(POI_LAYER_ID, !!o.poi && labelsOn));
  for (const m of ['labels', 'top'] as const) layers.push(marker(m));
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
