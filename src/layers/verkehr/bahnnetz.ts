// Railway network from OpenRailwayMap raster tiles: tracks and stations, maximum speed or electrification.
import { computed } from '@preact/signals';
import { rasterLayer } from '../../render/raster';
import { defineLayer } from '../define';
import type { LegendSpec } from '../types';

const MODES = {
  standard: { path: 'standard', label: 'Netz' },
  maxspeed: { path: 'maxspeed', label: 'Geschwindigkeit' },
  electrification: { path: 'electrification', label: 'Elektrifizierung' },
} as const;
type Mode = keyof typeof MODES;

const LEGENDS: Record<Mode, LegendSpec> = {
  standard: { type: 'classes', items: [
    { color: '#ff8c00', label: 'Hauptstrecke', shape: 'line' }, { color: '#9b9b9b', label: 'Nebenstrecke', shape: 'line' },
    { color: '#1e90ff', label: 'Schnellfahrstrecke', shape: 'line' }, { color: '#c8c8c8', label: 'Bahnhof', shape: 'dot' },
  ] },
  maxspeed: { type: 'scale', unit: 'km/h', stops: [[0, '#b00000'], [60, '#ff5a00'], [120, '#f2d100'], [200, '#3dbb3d'], [300, '#1e90ff']], ticks: [0, 60, 120, 200, 300] },
  electrification: { type: 'classes', items: [
    { color: '#ff0000', label: '15 kV 16,7 Hz (DE, AT, CH, NO, SE)', shape: 'line' }, { color: '#00a000', label: '25 kV 50 Hz', shape: 'line' },
    { color: '#ffc800', label: '3 kV Gleichstrom', shape: 'line' }, { color: '#0090ff', label: '1,5 kV Gleichstrom', shape: 'line' },
    { color: '#888888', label: 'nicht elektrifiziert', shape: 'line' },
  ] },
};

export default defineLayer({
  id: 'bahnnetz',
  category: 'verkehr',
  title: 'Bahnnetz',
  summary: 'Gleise und Bahnhöfe, wahlweise mit Streckengeschwindigkeit oder Stromsystem',
  icon: 'train',
  color: '#78909c',
  form: 'raster',
  cadence: 'static',
  coverage: 'Welt',
  sources: [{ name: 'OpenRailwayMap (OpenStreetMap-Mitwirkende)', url: 'https://www.openrailwaymap.org/', license: 'CC BY-SA 2.0 / ODbL' }],
  options: [
    { id: 'mode', label: 'Darstellung', type: 'select', default: 'standard', choices: (Object.keys(MODES) as Mode[]).map((m) => ({ value: m, label: MODES[m].label })) },
  ],
  legend: (o) => LEGENDS[(String(o.mode) in MODES ? String(o.mode) : 'standard') as Mode],
  keywords: ['bahn', 'gleis', 'schiene', 'strecke', 'rail', 'openrailwaymap', 'elektrifizierung', 'höchstgeschwindigkeit', 'oberleitung'],

  mount(ctx) {
    const tiles = computed(() => {
      const m = String(ctx.options.value.mode);
      const path = (m in MODES ? MODES[m as Mode] : MODES.standard).path;
      return ['a', 'b', 'c'].map((s) => `https://${s}.tiles.openrailwaymap.org/${path}/{z}/{x}/{y}.png`);
    });
    return rasterLayer(ctx, {
      tiles, maxzoom: 19,
      attribution: 'Bahnnetz: <a href="https://www.openrailwaymap.org/" target="_blank" rel="noopener">OpenRailwayMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-Mitwirkende</a>',
    });
  },
});
