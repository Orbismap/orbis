// Eigene Ebenen der Karte über dem Grundstil: Strecken, Halte der gezeigten Strecke und Haltestellen der Umgebung.
import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import type { Stop } from '../data/types';
import { modeVar, type ModeColor } from './mapData';
import type { MapRoute, MapStop } from './scene';
import type { FeatureCollection } from 'geojson';

export const SOURCES = ['routes', 'stops', 'nearby'] as const;
/** Haltestellen der Umgebung ab diesem Zoom (darunter die Bahnhöfe des Grundstils). */
export const NEARBY_ZOOM = 14;
/** Antippbare Ebenen, wichtigste zuerst. */
export const TAP_LAYERS = ['stops-dots', 'nearby-dots', 'rail-stations', 'routes-hit'] as const;

const INK = '#0a0f18';
const ex = (e: unknown) => e as ExpressionSpecification;
const fade = (full: number) => ex(['case', ['get', 'dim'], full * 0.35, full]);
const round = { 'line-cap': 'round', 'line-join': 'round' } as const;
const label = { 'text-color': '#eaf1fb', 'text-halo-color': 'rgba(10, 15, 24, 0.95)', 'text-halo-width': 1.6 };

export const LAYERS: LayerSpecification[] = [
  {
    id: 'nearby-dots', type: 'circle', source: 'nearby', minzoom: NEARBY_ZOOM,
    paint: { 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 5, 17, 8] },
  },
  {
    id: 'nearby-names', type: 'symbol', source: 'nearby', minzoom: 15,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.9, 'text-max-width': 9 },
    paint: label,
  },
  { id: 'routes-casing', type: 'line', source: 'routes', layout: round, paint: { 'line-color': INK, 'line-width': 10, 'line-opacity': fade(0.85) } },
  { id: 'routes-line', type: 'line', source: 'routes', filter: ['!', ['get', 'dashed']], layout: round, paint: { 'line-color': ['get', 'color'], 'line-width': 6, 'line-opacity': fade(1) } },
  { id: 'routes-walk', type: 'line', source: 'routes', filter: ['get', 'dashed'], layout: round, paint: { 'line-color': '#d0d8e5', 'line-width': 4, 'line-dasharray': [0.1, 1.8], 'line-opacity': fade(1) } },
  // breite, unsichtbare Fläche zum Antippen
  { id: 'routes-hit', type: 'line', source: 'routes', layout: round, paint: { 'line-width': 28, 'line-opacity': 0 } },
  {
    id: 'stops-dots', type: 'circle', source: 'stops',
    paint: {
      'circle-color': ['match', ['get', 'kind'], 'start', '#72c8f0', 'end', '#ff6b5e', 'selected', '#72c8f0', '#ffffff'],
      'circle-stroke-color': ['match', ['get', 'kind'], ['start', 'end', 'selected'], '#ffffff', ['get', 'color']],
      'circle-stroke-width': ['match', ['get', 'kind'], 'via', 2, 3],
      'circle-radius': ['match', ['get', 'kind'], 'via', 4, 'transfer', 6, 'selected', 10, 8],
    },
  },
  {
    id: 'stops-names', type: 'symbol', source: 'stops',
    layout: {
      'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12.5, 'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
      'text-radial-offset': 1.1, 'text-max-width': 10, 'symbol-sort-key': ['match', ['get', 'kind'], 'via', 2, 'transfer', 1, 0],
    },
    paint: label,
  },
];

/** Verkehrsmittel, dessen Farbe eine Haltestelle mit mehreren trägt: das gewichtigste. */
const RANK = ['fern', 'regio', 'sbahn', 'ubahn', 'tram', 'faehre', 'bus', 'fernbus'];
const mainMode = (s: Stop) => RANK.find((m) => s.modes?.includes(m as never)) ?? 'sonst';

const collection = (features: FeatureCollection['features']): FeatureCollection => ({ type: 'FeatureCollection', features });

export const routeFeatures = (routes: MapRoute[]) => collection(routes.filter((r) => r.coords.length > 1).map((r) => ({
  type: 'Feature', properties: { id: r.id, color: r.color, dashed: !!r.dashed, dim: !!r.dim }, geometry: { type: 'LineString', coordinates: r.coords },
})));

export const stopFeatures = (stops: MapStop[]) => collection(stops.map((s) => ({
  type: 'Feature', properties: { id: s.stop.id, name: s.stop.name, kind: s.kind, color: s.color ?? INK }, geometry: { type: 'Point', coordinates: [s.stop.lng, s.stop.lat] },
})));

export const nearbyFeatures = (stops: Stop[], color: ModeColor) => collection(stops.map((s) => ({
  type: 'Feature', properties: { id: s.id, name: s.name, color: color(mainMode(s)) }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
})));

/** Farbwert aus den CSS-Variablen der App. */
export const cssModeColor: ModeColor = (mode) => getComputedStyle(document.documentElement).getPropertyValue(modeVar(mode)).trim() || '#8a93a8';
