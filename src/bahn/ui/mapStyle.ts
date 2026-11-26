import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { wxStyle } from '@/wetter/features/forecast/map-style';

/**
 * Kartenstil der Bus-&-Bahn-App: der dunkle Stil der Wetterkarte plus das Schienennetz aus den OpenFreeMap-Kacheln
 * (U-Bahn blau, S-Bahn grün, Tram orange, Zug grau) und Bahnhöfe. Die Farben sind die der Linien-Badges. Die
 * Haltestellen der Umgebung kommen ab Zoom 14 von der Fahrplanquelle (mapLayers.ts) und lösen die Bahnhofspunkte ab.
 */
const SUBCLASSES = ['rail', 'light_rail', 'subway', 'tram', 'narrow_gauge', 'monorail', 'funicular'];
const byClass = (value: (sub: string) => string, fallback: string): ExpressionSpecification =>
  ['match', ['get', 'subclass'], 'subway', value('subway'), 'light_rail', value('light_rail'), 'tram', value('tram'), fallback] as ExpressionSpecification;
const WIDTH = (base: number): ExpressionSpecification =>
  ['interpolate', ['linear'], ['zoom'], 8, base * 0.4, 12, base, 15, base * 2, 18, base * 3.4] as ExpressionSpecification;
const COLOR: Record<string, string> = { subway: '#3f78e6', light_rail: '#2f9a6c', tram: '#d8921f' };

const transit: LayerSpecification[] = [
  {
    id: 'rail-casing', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 8,
    filter: ['all', ['in', ['get', 'subclass'], ['literal', SUBCLASSES]], ['!', ['has', 'service']]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#0a0f18', 'line-opacity': 0.85, 'line-width': WIDTH(3.2) },
  },
  {
    id: 'rail-lines', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 8,
    filter: ['all', ['in', ['get', 'subclass'], ['literal', SUBCLASSES]], ['!', ['has', 'service']]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': byClass((s) => COLOR[s]!, '#8e9ab0'), 'line-width': WIDTH(1.7) },
  },
  {
    id: 'rail-stations', type: 'circle', source: 'ofm', 'source-layer': 'poi', minzoom: 10, maxzoom: 14,
    filter: ['all', ['==', ['get', 'class'], 'railway'], ['in', ['get', 'subclass'], ['literal', ['station', 'halt']]]],
    paint: {
      'circle-color': '#ffffff', 'circle-stroke-color': '#0a0f18', 'circle-stroke-width': 2,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 5, 17, 8],
    },
  },
  {
    id: 'station-names', type: 'symbol', source: 'ofm', 'source-layer': 'poi', minzoom: 12,
    filter: ['all', ['==', ['get', 'class'], 'railway'], ['in', ['get', 'subclass'], ['literal', ['station', 'halt']]]],
    layout: {
      'text-field': ['coalesce', ['get', 'name:de'], ['get', 'name']], 'text-font': ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 13], 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-max-width': 8,
    },
    paint: { 'text-color': '#dfe7f3', 'text-halo-color': 'rgba(10, 15, 24, 0.92)', 'text-halo-width': 1.4 },
  },
];

export const bahnStyle: StyleSpecification = (() => {
  const style = structuredClone(wxStyle);
  // Vor den Ortsnamen einfügen, damit Orte über dem Netz stehen.
  const at = style.layers.findIndex((l) => l.id === 'places');
  style.layers.splice(at < 0 ? style.layers.length : at, 0, ...transit);
  return style;
})();
