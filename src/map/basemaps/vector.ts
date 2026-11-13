// Orbis dark/light basemaps built in code on OpenFreeMap vector tiles (OpenMapTiles schema).
// Colours follow Apple Maps (standard map, light and dark appearance): warm off-white / graphite land,
// clear blue water, soft green parks, white (dark: grey) streets and yellow-amber motorways.
import type { ExpressionSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { BasemapDef, LabelVariant } from './types';
import { BUILDING_BASE, BUILDING_HEIGHT } from '../buildings-tilt';

export const OFM_URL = 'https://tiles.openfreemap.org/planet';
export const OFM_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const OFM_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export const OFM_SOURCE: SourceSpecification = { type: 'vector', url: OFM_URL, attribution: OFM_ATTRIBUTION };

export const FONT_REGULAR = ['Noto Sans Regular'];
export const FONT_BOLD = ['Noto Sans Bold'];
export const FONT_ITALIC = ['Noto Sans Italic'];

interface Palette {
  land: string; water: string; ice: string; wood: string; grass: string; urban: string; industrial: string;
  roadMinor: string; roadMajor: string; highway: string; casing: string; highwayCasing: string; building: string;
  /** Fill of trunk roads (between primary and motorway); defaults to roadMajor. */
  trunk?: string;
  /** Road fill when zoomed in close (Apple dark: streets turn dark asphalt); defaults to the normal fill. */
  roadNear?: string;
  border: string; borderSoft: string; rail: string; space: string;
}

const PALETTE: Record<'dark' | 'light', Palette> = {
  dark: {
    // sampled from Apple Maps dark screenshots: slate-blue land, teal parks, navy water, blue-grey buildings
    land: '#344559', water: '#1f3679', ice: '#4a5b70', wood: '#015856', grass: '#0a5a56', urban: '#344559', industrial: '#36475b',
    roadMinor: '#526175', roadMajor: '#7b8fa6', trunk: '#9bb2c9', highway: '#b2c6e2', casing: '#2b3a4d', highwayCasing: '#2b3a4d', building: '#546989',
    roadNear: '#2f343f', border: '#7b8aa3', borderSoft: 'rgba(123, 138, 163, 0.5)', rail: '#2c3b4e', space: '#0A0F18',
  },
  light: {
    // measured from Apple Newsroom images of the new map (2023): warm ground, cyan water, fresh green, warm buildings
    land: '#f7f4eb', water: '#8ddcf8', ice: '#ffffff', wood: '#bbe2a1', grass: '#c5e8a6', urban: '#f4f1e8', industrial: '#efede8',
    roadMinor: '#ffffff', roadMajor: '#ffffff', highway: '#f9d46e', casing: '#e4dfd3', highwayCasing: '#e2aa45', building: '#ece6da',
    border: '#a89fb8', borderSoft: 'rgba(168, 159, 184, 0.7)', rail: '#cdc9c2', space: '#F4F6F9',
  },
};

const hidden = { visibility: 'none' as const };

export function vectorBasemap(theme: 'dark' | 'light'): BasemapDef {
  const c = PALETTE[theme];
  const id = (s: string) => `bm-orbis-${theme}-${s}`;
  const roadWidth = (base: number): ExpressionSpecification => ['interpolate', ['exponential', 1.5], ['zoom'], 5, base * 0.3, 10, base, 16, base * 6];
  /** Fill colour that fades to `roadNear` between z16 and z17.5 (dark map only). */
  const roadFill = (col: string | ExpressionSpecification): string | ExpressionSpecification =>
    c.roadNear ? ['interpolate', ['linear'], ['zoom'], 16, col, 17.5, c.roadNear] as ExpressionSpecification : col;
  const roadLayout = { ...hidden, 'line-cap': 'round' as const, 'line-join': 'round' as const };
  const minorClasses = ['literal', ['secondary', 'tertiary', 'minor', 'street']] as ExpressionSpecification;
  const majorClasses = ['literal', ['motorway', 'trunk', 'primary']] as ExpressionSpecification;
  const layers: LayerSpecification[] = [
    { id: id('bg'), type: 'background', layout: hidden, paint: { 'background-color': c.land } },
    {
      id: id('landcover'), type: 'fill', source: 'ofm', 'source-layer': 'landcover', layout: hidden,
      paint: { 'fill-color': ['match', ['get', 'class'], 'ice', c.ice, 'wood', c.wood, 'forest', c.wood, c.grass], 'fill-opacity': ['match', ['get', 'class'], 'ice', 1, 'wood', 1, 'forest', 1, 'grass', 1, 0.7] },
    },
    {
      id: id('landuse'), type: 'fill', source: 'ofm', 'source-layer': 'landuse', minzoom: 8, layout: hidden,
      filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood', 'commercial', 'industrial']]],
      paint: { 'fill-color': ['match', ['get', 'class'], 'commercial', c.industrial, 'industrial', c.industrial, c.urban], 'fill-opacity': 1 },
    },
    {
      id: id('waterway'), type: 'line', source: 'ofm', 'source-layer': 'waterway', minzoom: 6, layout: hidden,
      paint: { 'line-color': c.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 14, 3] },
    },
    { id: id('water'), type: 'fill', source: 'ofm', 'source-layer': 'water', layout: hidden, paint: { 'fill-color': c.water } },
    {
      id: id('border-country'), type: 'line', source: 'ofm', 'source-layer': 'boundary', layout: { ...hidden, 'line-join': 'round' },
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': c.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 8, 1.4] },
    },
    {
      id: id('border-state'), type: 'line', source: 'ofm', 'source-layer': 'boundary', minzoom: 4, layout: { ...hidden, 'line-join': 'round' },
      filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': c.borderSoft, 'line-width': 0.7, 'line-dasharray': [3, 2] },
    },
    {
      id: id('rails'), type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 8, layout: hidden,
      filter: ['all', ['in', ['get', 'class'], ['literal', ['rail', 'transit']]], ['!=', ['get', 'brunnel'], 'tunnel']],
      paint: { 'line-color': c.rail, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.3, 12, 0.8, 18, 2.5] },
    },
    {
      id: id('roads-minor-casing'), type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 12, layout: roadLayout,
      filter: ['in', ['get', 'class'], minorClasses], paint: { 'line-color': roadFill(c.casing), 'line-width': roadWidth(1.05) },
    },
    {
      id: id('roads-major-casing'), type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 6, layout: roadLayout,
      filter: ['in', ['get', 'class'], majorClasses],
      paint: { 'line-color': roadFill(['match', ['get', 'class'], 'motorway', c.highwayCasing, c.casing]), 'line-width': roadWidth(1.5) },
    },
    {
      id: id('roads-minor'), type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 12, layout: roadLayout,
      filter: ['in', ['get', 'class'], minorClasses], paint: { 'line-color': roadFill(c.roadMinor), 'line-width': roadWidth(0.6) },
    },
    {
      id: id('roads-major'), type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 6, layout: roadLayout,
      filter: ['in', ['get', 'class'], majorClasses],
      paint: { 'line-color': roadFill(['match', ['get', 'class'], 'motorway', c.highway, 'trunk', c.trunk ?? c.roadMajor, c.roadMajor]), 'line-width': roadWidth(0.9) },
    },
  ];
  const topLayers: LayerSpecification[] = [
    {
      // 2.5D buildings (OpenMapTiles `building`: render_height / render_min_height, metres); height follows the pitch, see buildings-tilt.ts. Rounded corners need maplibre-gl >= 6.2.
      id: id('building'), type: 'fill-extrusion', source: 'ofm', 'source-layer': 'building', minzoom: 13.5, layout: { ...hidden, 'fill-extrusion-rounded-corner-distance': 1.5 },
      paint: {
        'fill-extrusion-color': c.building,
        'fill-extrusion-height': BUILDING_HEIGHT,
        'fill-extrusion-base': BUILDING_BASE,
        'fill-extrusion-opacity': theme === 'dark' ? 1 : 0.92,
        'fill-extrusion-vertical-gradient': true,
      },
    },
  ];
  return {
    id: theme === 'dark' ? 'orbis-dark' : 'orbis-light',
    label: theme === 'dark' ? 'Orbis dunkel' : 'Orbis hell',
    sources: {},
    layers,
    topLayers,
    labelVariant: theme,
    background: c.space,
    theme,
  };
}

// ---- labels ---------------------------------------------------------------

const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:de'], ['get', 'name_de'], ['get', 'name:latin'], ['get', 'name']];

interface LabelPaint { text: string; halo: string; water: string; country: string; border: string; borderSoft: string }
const LABEL_PAINT: Record<LabelVariant, LabelPaint> = {
  dark: { text: '#dfe5ee', halo: 'rgba(30, 41, 56, 0.9)', water: '#6f95d6', country: '#c9d1de', border: '', borderSoft: '' },
  light: { text: '#3c3c43', halo: 'rgba(255, 255, 255, 0.92)', water: '#358dbb', country: '#55525e', border: '', borderSoft: '' },
  imagery: { text: '#ffffff', halo: 'rgba(0, 0, 0, 0.75)', water: 'rgba(190, 215, 255, 0.9)', country: '#ffffff', border: 'rgba(255, 255, 255, 0.5)', borderSoft: 'rgba(255, 255, 255, 0.28)' },
};

/** ISO codes of micro-states and tiny territories: labelled only when zoomed in. */
const MICRO = ['AD', 'MC', 'SM', 'LI', 'VA', 'GI', 'MT', 'GG', 'JE', 'IM', 'LU', 'SG', 'BH', 'MV', 'KM', 'SC', 'BB', 'AG', 'DM', 'KN', 'LC', 'VC', 'GD', 'TV', 'NR', 'PW', 'MH', 'FM', 'AX', 'FO'];

/** Country names by OpenMapTiles `rank` (1 largest … 4 tiny): size grows with importance, small ones appear later. */
function countryLabels(id: (s: string) => string, p: LabelPaint, text: Record<string, unknown>): LayerSpecification[] {
  const size = (lo: number, hi: number, z0: number, z1: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], z0, lo, z1, hi];
  const mk = (name: string, minzoom: number, filter: ExpressionSpecification, fontSize: ExpressionSpecification, font: string[]): LayerSpecification => ({
    id: id(name), type: 'symbol', source: 'ofm', 'source-layer': 'place', minzoom, maxzoom: 9, filter,
    layout: { ...hidden, 'text-field': NAME, 'text-font': font, 'text-size': fontSize, 'text-max-width': 7, 'symbol-sort-key': ['coalesce', ['get', 'rank'], 99] },
    paint: { ...(text as object), 'text-color': p.country },
  } as LayerSpecification);
  const micro: ExpressionSpecification = ['in', ['get', 'iso_a2'], ['literal', MICRO]];
  const cls: ExpressionSpecification = ['==', ['get', 'class'], 'country'];
  return [
    mk('country-1', 1, ['all', cls, ['<=', ['to-number', ['get', 'rank'], 99], 1], ['!', micro]], size(10.5, 16, 1, 6), FONT_BOLD),
    mk('country-2', 3, ['all', cls, ['==', ['to-number', ['get', 'rank'], 99], 2], ['!', micro]], size(10, 14.5, 3, 6), FONT_BOLD),
    mk('country-3', 4.5, ['all', cls, ['==', ['to-number', ['get', 'rank'], 99], 3], ['!', micro]], size(9.5, 13, 4.5, 6.5), FONT_BOLD),
    mk('country-4', 6, ['all', cls, ['any', ['>=', ['to-number', ['get', 'rank'], 99], 4], micro]], size(9.5, 12, 6, 8), FONT_REGULAR),
  ];
}

/** Place names (and, on imagery, borders) for one basemap family. Ids start with `lbl-<variant>-`. */
export function labelLayers(variant: LabelVariant): LayerSpecification[] {
  const p = LABEL_PAINT[variant];
  const id = (s: string) => `lbl-${variant}-${s}`;
  const text = { 'text-color': p.text, 'text-halo-color': p.halo, 'text-halo-width': 1.3 };
  const layers: LayerSpecification[] = [];
  if (variant === 'imagery') {
    layers.push(
      {
        id: id('border-country'), type: 'line', source: 'ofm', 'source-layer': 'boundary', layout: { ...hidden, 'line-join': 'round' },
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': p.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 8, 1.5] },
      },
      {
        id: id('border-state'), type: 'line', source: 'ofm', 'source-layer': 'boundary', minzoom: 4, layout: { ...hidden, 'line-join': 'round' },
        filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': p.borderSoft, 'line-width': 0.8, 'line-dasharray': [3, 2] },
      },
    );
  }
  layers.push(
    {
      id: id('water'), type: 'symbol', source: 'ofm', 'source-layer': 'water_name', layout: { ...hidden, 'text-field': NAME, 'text-font': FONT_ITALIC, 'text-size': 12, 'text-max-width': 6 },
      filter: ['in', ['get', 'class'], ['literal', ['ocean', 'sea']]], paint: { ...text, 'text-color': p.water, 'text-halo-width': 0.8 },
    },
    {
      id: id('town'), type: 'symbol', source: 'ofm', 'source-layer': 'place', minzoom: 8,
      layout: { ...hidden, 'text-field': NAME, 'text-font': FONT_REGULAR, 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 14], 'symbol-sort-key': ['coalesce', ['get', 'rank'], 99] },
      filter: ['in', ['get', 'class'], ['literal', ['town', 'village']]], paint: text,
    },
    {
      id: id('suburb'), type: 'symbol', source: 'ofm', 'source-layer': 'place', minzoom: 12, maxzoom: 17,
      layout: { ...hidden, 'text-field': NAME, 'text-font': FONT_REGULAR, 'text-size': 11, 'text-letter-spacing': 0.06, 'text-max-width': 7 },
      filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter']]], paint: { ...text, 'text-opacity': 0.8 },
    },
    {
      id: id('road'), type: 'symbol', source: 'ofm', 'source-layer': 'transportation_name', minzoom: 13,
      layout: { ...hidden, 'symbol-placement': 'line', 'text-field': NAME, 'text-font': FONT_REGULAR, 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 17, 12], 'text-letter-spacing': 0.04, 'symbol-spacing': 320 },
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'street']]], paint: { ...text, 'text-opacity': 0.85 },
    },
    {
      id: id('city'), type: 'symbol', source: 'ofm', 'source-layer': 'place', minzoom: 3,
      layout: {
        ...hidden, 'text-field': NAME, 'text-font': FONT_REGULAR, 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 8, 14, 12, 17],
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99], 'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.4,
      },
      filter: ['==', ['get', 'class'], 'city'], paint: text,
    },
    {
      id: id('state'), type: 'symbol', source: 'ofm', 'source-layer': 'place', minzoom: 6, maxzoom: 9,
      layout: { ...hidden, 'text-field': NAME, 'text-font': FONT_REGULAR, 'text-size': 11, 'text-transform': 'uppercase', 'text-letter-spacing': 0.1 },
      filter: ['==', ['get', 'class'], 'state'], paint: { ...text, 'text-opacity': 0.6 },
    },
    ...countryLabels(id, p, text),
  );
  return layers;
}

export const LABEL_VARIANTS: LabelVariant[] = ['dark', 'light', 'imagery'];
