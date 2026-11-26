import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { BUILDING_FILTER, REAL_BUILDING_BASE, REAL_BUILDING_HEIGHT } from '@/map/buildings-tilt';
import { wxStyle } from '@/wetter/features/forecast/map-style';

/** The dark style of the weather map plus what one needs to find the last few hundred metres: paths, 2.5D buildings, street names. */
const near: LayerSpecification[] = [
  {
    id: 'roads-service', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 13,
    filter: ['in', ['get', 'class'], ['literal', ['service', 'track']]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#2a374e', 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 13, 0.6, 18, 7] },
  },
  {
    id: 'paths', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 14,
    filter: ['==', ['get', 'class'], 'path'],
    paint: { 'line-color': '#4a5b7d', 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 14, 0.6, 18, 2.4], 'line-dasharray': [2, 1.5] },
  },
  // above the roads and paths, below the names
  {
    id: 'buildings', type: 'fill-extrusion', source: 'ofm', 'source-layer': 'building', minzoom: 14, filter: BUILDING_FILTER,
    paint: { 'fill-extrusion-color': '#34435f', 'fill-extrusion-height': REAL_BUILDING_HEIGHT, 'fill-extrusion-base': REAL_BUILDING_BASE, 'fill-extrusion-opacity': 0.85, 'fill-extrusion-vertical-gradient': true },
  },
  {
    id: 'street-names', type: 'symbol', source: 'ofm', 'source-layer': 'transportation_name', minzoom: 14,
    layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
    paint: { 'text-color': '#8fa0bc', 'text-halo-color': 'rgba(10, 15, 24, 0.9)', 'text-halo-width': 1.2 },
  },
];

/** The target stands out in the accent colour, the other places around are grey (as in app.css). */
const TARGET = '#72c8f0';
const OTHER = '#8d98a8';

/** What the app draws on top: the way and what was found. FindMap fills these sources. The base style names its town labels `places`. */
const overlay: LayerSpecification[] = [
  { id: 'route', type: 'line', source: 'route', filter: ['!', ['get', 'direct']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': TARGET, 'line-width': 6, 'line-opacity': 0.9 } },
  { id: 'route-direct', type: 'line', source: 'route', filter: ['get', 'direct'], paint: { 'line-color': TARGET, 'line-width': 3, 'line-dasharray': [1.5, 1.5] } },
  { id: 'found-others', type: 'circle', source: 'found', filter: ['!', ['get', 'target']], paint: { 'circle-color': OTHER, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3, 17, 8], 'circle-opacity': 0.55 } },
  { id: 'found-target', type: 'circle', source: 'found', filter: ['get', 'target'], paint: { 'circle-color': TARGET, 'circle-radius': 11, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3.5 } },
];

/** The layers a tap picks a place from. */
export const FOUND_LAYERS = ['found-others', 'found-target'];

export const findStyle: StyleSpecification = (() => {
  const style = structuredClone(wxStyle);
  const at = style.layers.findIndex((l) => l.id === 'places');
  style.layers.splice(at < 0 ? style.layers.length : at, 0, ...near);
  style.layers.push(...overlay);
  for (const id of ['route', 'found']) style.sources[id] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
  return style;
})();
