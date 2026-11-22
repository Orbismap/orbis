// "Orbis Karte": a flat 2D map in the look of Apple Maps (dark), built in code on the OpenFreeMap vector tiles
// (OpenMapTiles schema), like the other Orbis basemaps. Colours and zoom thresholds were measured on Apple Maps
// (tools/vector-basemap/palette.md); the OFM tiles only tell us which classes exist, WHEN a class shows is decided here.
// Zoom values are MapLibre zooms (512 px tiles).
import type { ExpressionSpecification as Ex, LayerSpecification } from 'maplibre-gl';
import { BUILDING_BASE, BUILDING_FILTER, BUILDING_HEIGHT, OFM_BUILDINGS_SOURCE_ID } from '../buildings-tilt';
import { karteDataUrl } from './karte-data';
import { KARTE_LABELS_SOURCE } from './karte-labels';
import type { BasemapDef } from './types';

/** Small PMTiles overlay with areas OpenMapTiles leaves out (landfills), built by tools/vector-basemap/build-overlay.sh. Hessen only for now. */
export const KARTE_OVERLAY_SOURCE = 'karte-overlay';
/** Global land cover as vector areas (Natural Earth classified, tools/vector-basemap/build-landcover-vector.sh): deserts, steppe, savanna, forests, ice at low zoom. */
export const KARTE_LANDCOVER_SOURCE = 'karte-landcover';
/**
 * Sea floor for the depth gradient: the app's own terrain (Mapterhorn) is flat at 0 on the sea, so the gradient has its own DEM, the
 * AWS Terrain Tiles (GEBCO/ETOPO1 sea floor). Only the sea is drawn from it (zoom <= 8, land is transparent), so its land datum and
 * errors do not matter, and it is a separate source from the 3D terrain, as MapLibre wants it.
 */
export const KARTE_SEA_SOURCE = 'karte-sea-depth';
/** Fine global land cover (Copernicus CGLS-LC100 vectorised, tools/vector-basemap/build-landcover-lc100.sh), classes see HI below. */
export const KARTE_LANDCOVER_HI_SOURCE = 'karte-landcover-hi';

const K = {
  space: '#0A0F18', ocean: '#0c183b', land: '#356e58', water: '#1f3679',
  forestFar: '#3c735c', forest: '#01645f', forestNear: '#00605c',
  desert: '#80806a', steppe: '#667a5a', savanna: '#46805f', temperate: '#3a7059', taiga: '#2b6857', rainforest: '#037071', tundra: '#58726a', highland: '#69796f',
  farmland: '#356e58', grass: '#1b6a5c', grassNear: '#07604d', wild: '#3a6f5a', bare: '#7c7c64', ice: '#7b8aa6',
  urbanFar: '#384d66', urbanNear: '#343f56', commercial: '#4a4670', commercialNear: '#3c415f', institutional: '#4a3f56', institutionalNear: '#3b3f56',
  roadMinorFar: '#4d6c7c', roadMinor: '#47617e', roadMajor: '#8496b2', motorway: '#919cc5', roadDark: '#2e333e',
  quarry: '#515f4e', path: '#9a7f5c', bridge: '#4a5a78', rail: '#3f4c68', building: '#46597c',
  // Apple draws borders as a muted dark red; measured ≈ #71595f over desert and #564c65 over green land, i.e. a translucent line
  border: 'rgba(165, 80, 130, 0.92)', borderSoft: 'rgba(165, 80, 130, 0.5)',
};

const HI = {
  desert: '#80806a', shrub: '#667a5a', grass: '#46805f', farmland: '#437a62', woodland: '#3f7a5e', forest: '#3a7059',
  taiga: '#2b6857', rainforest: '#037071', wetland: '#2f6a60', tundra: '#58726a', ice: '#8895b2',
};

const z = (...stops: (number | string | Ex)[]): Ex => ['interpolate', ['linear'], ['zoom'], ...stops] as Ex;
const cls = (...v: string[]): Ex => ['in', ['get', 'class'], ['literal', v]] as Ex;
const hidden = { visibility: 'none' as const };
const round = { ...hidden, 'line-cap': 'round' as const, 'line-join': 'round' as const };

/** What is drawn as thin paths; the road thresholds below follow tools/vector-basemap/schema.yml. */
const PATHS = ['path', 'track'];
const notPath: Ex = ['!', cls(...PATHS, 'ferry', 'rail', 'transit', 'pier', 'aerialway')];

export function karteBasemap(): BasemapDef {
  const id = (s: string) => `bm-orbis-karte-${s}`;
  const tr = { source: 'ofm', 'source-layer': 'transportation' } as const;
  const noTunnel: Ex = ['!=', ['get', 'brunnel'], 'tunnel'];

  const layers: LayerSpecification[] = [
    { id: id('bg'), type: 'background', layout: hidden, paint: { 'background-color': K.land } },
    // flat ocean underneath: the safety net below the depth gradient (if the DEM tiles are slow or missing the sea stays dark blue, not land green)
    { id: id('ocean-flat'), type: 'fill', source: 'ofm', 'source-layer': 'water', layout: hidden, filter: cls('ocean'), paint: { 'fill-color': K.ocean } },
    // ocean depth in Apple's blue steps (coast #1c3275 -> deep sea #000d2d), coloured from its own sea-floor DEM (KARTE_SEA_SOURCE).
    // The flat vector ocean fades in from zoom 6 to 8 and takes over (see the water layer).
    {
      id: id('bathymetry'), type: 'color-relief', source: KARTE_SEA_SOURCE, layout: hidden,
      paint: {
        'color-relief-color': ['interpolate', ['linear'], ['elevation'],
          -6000, '#000d2d', -3500, '#0c163a', -2000, '#0c183b', -1000, '#0c1d4b', -500, '#0d2253', -200, '#13255c', -50, '#152963', -1, '#1c3275', 0, 'rgba(28, 50, 117, 0)'] as Ex,
        'color-relief-opacity': z(6, 1, 8, 0),
      },
    },
    // global land cover areas (classes of the Natural Earth land cover, clipped to the real coast). Always on, below the OFM polygons:
    // where those have gaps - deserts, steppe, tundra - these show through. Two greens: light (steppe, savanna) and dark teal (forests).
    {
      id: id('landcover-low'), type: 'fill', source: KARTE_LANDCOVER_SOURCE, 'source-layer': 'landcover', layout: hidden,
      paint: {
        'fill-color': ['match', ['get', 'class'],
          'desert', K.desert, 'steppe', K.steppe, 'savanna', K.savanna, 'temperate', K.temperate, 'taiga', K.taiga,
          'rainforest', K.rainforest, 'tundra', K.tundra, 'highland', K.highland, 'ice', K.ice, K.land] as Ex,
      },
    },
    // fine land cover (~1 km): hides the rectangular edges of the OSM land cover polygons, which only take over from zoom 10 to 11.5
    {
      id: id('landcover-hi'), type: 'fill', source: KARTE_LANDCOVER_HI_SOURCE, 'source-layer': 'landcover', layout: hidden,
      paint: { 'fill-color': ['match', ['get', 'class'], ...Object.entries(HI).flat(), K.land] as unknown as Ex },
    },
    // Below zoom 6 OFM only has coarse, merged residential blobs that shrink when the next tile level loads, so urban areas start at 6.
    // one layer per class: the zoom may only drive a colour at the top of an interpolate, not inside a match
    ...([
      ['forest', cls('wood', 'forest'), z(5, K.forestFar, 9, K.forest, 15, K.forestNear)],
      ['grass', cls('grass'), z(6, K.farmland, 10, K.grass, 15, K.grassNear)],
      ['farmland', cls('farmland'), K.farmland],
      ['wild', cls('wetland'), K.wild],
      ['bare', cls('sand', 'rock'), K.bare],
      ['ice', cls('ice'), K.ice],
    ] as [string, Ex, Ex | string][]).map(([n, filter, color]): LayerSpecification => ({
      id: id(`landcover-${n}`), type: 'fill', source: 'ofm', 'source-layer': 'landcover', layout: hidden, filter, paint: { 'fill-color': color, 'fill-opacity': z(10, 0, 11.5, 1) },
    })),
    ...([
      ['urban', cls('residential', 'suburb', 'neighbourhood', 'quarter', 'industrial', 'stadium', 'pitch', 'track', 'railway', 'garages', 'military', 'bus_station', 'playground'), 6, z(4, K.urbanFar, 10, K.urbanFar, 15, K.urbanNear), z(6, 0.55, 8, 1)],
      // businesses and institutions fade in early (like Apple's purple and brown patches) and turn grey when zoomed in
      ['commercial', cls('commercial', 'retail'), 8, z(13, K.commercial, 17, K.commercialNear), z(8, 0, 10.5, 1)],
      ['institutional', cls('hospital', 'school', 'university', 'college', 'kindergarten'), 8, z(13, K.institutional, 17, K.institutionalNear), z(8, 0, 10.5, 1)],
      ['cemetery', cls('cemetery'), 10, K.grassNear, 1],
      // quarries (Apple: olive brown). OpenMapTiles has no landfill class, so tips like the Deponie Wicker are not in the OFM tiles
      ['quarry', cls('quarry'), 9, K.quarry, 1],
    ] as [string, Ex, number, Ex | string, Ex | number][]).map(([n, filter, minzoom, color, opacity]): LayerSpecification => ({
      id: id(`landuse-${n}`), type: 'fill', source: 'ofm', 'source-layer': 'landuse', minzoom, layout: hidden, filter, paint: { 'fill-color': color, 'fill-opacity': opacity },
    })),
    { id: id('landfill'), type: 'fill', source: KARTE_OVERLAY_SOURCE, 'source-layer': 'landfill', minzoom: 9, layout: hidden, paint: { 'fill-color': K.quarry } },
    // relief shading as a 2D overlay (the DEM source is part of every composed style, see composeStyle)
    {
      id: id('relief'), type: 'hillshade', source: 'terrain-dem', layout: hidden,
      paint: {
        'hillshade-exaggeration': z(5, 0.3, 12, 0.2, 16, 0.08), 'hillshade-shadow-color': '#000a1e', 'hillshade-highlight-color': '#7f9a9a',
        'hillshade-accent-color': '#02142e', 'hillshade-illumination-direction': 315,
      },
    },
    // only the big rivers from afar; streams and ditches only close up (Apple shows few of them). Filters cannot depend on the zoom, so one layer per step.
    ...([['river-canal', 6, ['river', 'canal']], ['stream', 12, ['stream']], ['ditch', 14, ['drain', 'ditch']]] as [string, number, string[]][]).map(([n, minzoom, classes]): LayerSpecification => ({
      id: id(`waterway-${n}`), type: 'line', source: 'ofm', 'source-layer': 'waterway', minzoom, layout: hidden, filter: cls(...classes),
      paint: { 'line-color': K.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 12, 1.2, 14, 3, 18, 10] as Ex },
    })),
    {
      id: id('water'), type: 'fill', source: 'ofm', 'source-layer': 'water', layout: hidden,
      // the ocean polygon only shows from zoom 6 on, below it the depth gradient (bathymetry) is the ocean
      paint: { 'fill-color': ['match', ['get', 'class'], 'ocean', K.ocean, K.water] as Ex, 'fill-opacity': z(6, ['case', ['==', ['get', 'class'], 'ocean'], 0, 1] as Ex, 8, 1) },
    },
    {
      id: id('border-country'), type: 'line', source: 'ofm', 'source-layer': 'boundary', layout: { ...hidden, 'line-join': 'round' },
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': K.border, 'line-width': z(1, 0.8, 4, 1.2, 8, 1.8, 14, 2.4) },
    },
    {
      id: id('border-state'), type: 'line', source: 'ofm', 'source-layer': 'boundary', minzoom: 4, layout: { ...hidden, 'line-join': 'round' },
      filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': K.borderSoft, 'line-width': z(4, 0.6, 10, 1), 'line-dasharray': [3, 2] },
    },
    {
      id: id('rail'), type: 'line', ...tr, minzoom: 8, layout: hidden,
      filter: ['all', cls('rail', 'transit'), noTunnel],
      paint: { 'line-color': K.rail, 'line-width': z(8, 0.3, 12, 0.8, 18, 2.5) },
    },
    // paths: dashed brown until zoom 16, then thin solid in the dark road colour
    {
      id: id('path-dash'), type: 'line', ...tr, minzoom: 15, maxzoom: 16, layout: { ...hidden, 'line-join': 'round' },
      filter: cls(...PATHS),
      paint: { 'line-color': K.path, 'line-opacity': z(15, 0, 15.3, 0.85, 15.5, 0.85, 16, 0), 'line-width': z(15, 0.5, 16, 0.9), 'line-dasharray': [3, 2.5] },
    },
    {
      id: id('path'), type: 'line', ...tr, minzoom: 15.5, layout: round,
      filter: cls(...PATHS),
      paint: { 'line-color': K.roadDark, 'line-opacity': z(15.5, 0, 16, 1), 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 16, 0.7, 19, 2.6] as Ex },
    },
    {
      id: id('bridge'), type: 'line', ...tr, minzoom: 15.5, layout: { ...hidden, 'line-cap': 'butt' },
      filter: ['all', ['==', ['get', 'brunnel'], 'bridge'], notPath],
      paint: { 'line-color': K.bridge, 'line-opacity': z(15.5, 0, 16, 1), 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 16, 7, 19, 26] as Ex },
    },
    // everything below secondary: the OFM tiles carry it from far out, Apple shows it from about zoom 11 (tertiary) and 12 (streets) on
    ...([['tertiary', 11, ['tertiary']], ['street', 12, ['minor', 'service', 'busway', 'raceway']]] as [string, number, string[]][]).map(([n, minzoom, classes]): LayerSpecification => ({
      id: id(`road-${n}`), type: 'line', ...tr, minzoom, layout: round,
      filter: ['all', cls(...classes), ['!=', ['get', 'brunnel'], 'ford']] as Ex,
      paint: {
        'line-color': z(10, K.roadMinorFar, 14, K.roadMinor, 15.5, K.roadMinor, 16, K.roadDark),
        'line-opacity': z(10, 0.55, 14, 1),
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 0.7, 13, 1, 16, 5, 19, 18] as Ex,
      },
    })),
    // motorway 4, trunk 5, primary 7, secondary 10; ramps of the motorways a bit later
    ...([['motorway', 4, ['all', cls('motorway'), ['!=', ['get', 'ramp'], 1]]], ['ramp', 10.5, ['all', cls('motorway', 'trunk'), ['==', ['get', 'ramp'], 1]]], ['trunk', 5, ['all', cls('trunk'), ['!=', ['get', 'ramp'], 1]]], ['primary', 7, cls('primary')], ['secondary', 10, cls('secondary')]] as [string, number, Ex][]).map(([n, minzoom, filter]): LayerSpecification => ({
      id: id(`road-${n}`), type: 'line', ...tr, minzoom, layout: round, filter,
      paint: {
        'line-color': z(10, n === 'motorway' ? K.motorway : K.roadMajor, 15.5, n === 'motorway' ? K.motorway : K.roadMajor, 16, K.roadDark),
        // below one device pixel the light lines look dashed and flicker, so they start at about a pixel
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 4, 1, 8, 1.2, 11, 1.7, 16, 9, 19, 34] as Ex,
        'line-opacity': z(4, 0.8, 10, 1),
      },
    })),
  ];
  const topLayers: LayerSpecification[] = [
    {
      // flat at pitch 0, full height at the tilt limit, see buildings-tilt.ts
      id: id('building'), type: 'fill-extrusion', source: OFM_BUILDINGS_SOURCE_ID, 'source-layer': 'building', minzoom: 13.5, filter: BUILDING_FILTER, layout: { ...hidden, 'fill-extrusion-rounded-corner-distance': 1.5 },
      paint: {
        'fill-extrusion-color': K.building,
        'fill-extrusion-height': BUILDING_HEIGHT,
        'fill-extrusion-base': BUILDING_BASE,
        'fill-extrusion-opacity': 1,
        'fill-extrusion-vertical-gradient': true,
      },
    },
  ];
  return { id: 'orbis-karte', label: 'Orbis Karte', sources: {
      [KARTE_OVERLAY_SOURCE]: { type: 'vector', url: karteDataUrl('overlay'), minzoom: 6, maxzoom: 14 },
      [KARTE_LABELS_SOURCE]: { type: 'vector', url: karteDataUrl('labels'), minzoom: 0, maxzoom: 6 },
      [KARTE_LANDCOVER_HI_SOURCE]: { type: 'vector', url: karteDataUrl('landcover-hi'), minzoom: 0, maxzoom: 8 },
      [KARTE_LANDCOVER_SOURCE]: { type: 'vector', url: karteDataUrl('landcover-vec'), minzoom: 0, maxzoom: 6 },
      [KARTE_SEA_SOURCE]: {
        type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 8, encoding: 'terrarium',
        attribution: '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Mapzen Terrain Tiles</a> (GEBCO, ETOPO1)',
      },
    }, layers, topLayers, labelVariant: 'karte', background: K.space, theme: 'dark' };
}
