// Waymarked Trails: signposted cycling or hiking routes as raster tiles.
import { computed } from '@preact/signals';
import { rasterLayer } from '../../render/raster';
import { defineLayer } from '../define';
import type { LegendSpec } from '../types';

const MODES = {
  cycling: { label: 'Radwege', color: '#43a047' },
  hiking: { label: 'Wanderwege', color: '#e8793a' },
} as const;
type Mode = keyof typeof MODES;

export default defineLayer({
  id: 'wegenetze',
  category: 'verkehr',
  title: 'Rad- und Wanderwege',
  summary: 'Ausgeschilderte Fernrad- und Wanderrouten, wahlweise Rad oder Wandern',
  icon: 'map',
  color: '#43a047',
  form: 'raster',
  cadence: 'static',
  coverage: 'Welt',
  sources: [{ name: 'Waymarked Trails (OpenStreetMap-Mitwirkende)', url: 'https://waymarkedtrails.org/', license: 'CC BY-SA 3.0 / ODbL' }],
  options: [
    { id: 'mode', label: 'Art', type: 'select', default: 'cycling', choices: [{ value: 'cycling', label: 'Rad' }, { value: 'hiking', label: 'Wandern' }] },
  ],
  legend: (o): LegendSpec => ({
    type: 'classes',
    items: o.mode === 'hiking'
      ? [{ color: '#e8793a', label: 'Wanderrouten (Weltweit, regional, lokal)', shape: 'line' }]
      : [{ color: '#2d6cdf', label: 'Internationale und nationale Radrouten', shape: 'line' }, { color: '#e03a3a', label: 'Regionale Routen', shape: 'line' }, { color: '#43a047', label: 'Lokale Routen', shape: 'line' }],
  }),
  keywords: ['radweg', 'wanderweg', 'radroute', 'wandern', 'fahrrad', 'cycling', 'hiking', 'waymarked trails', 'eurovelo', 'fernwanderweg'],

  mount(ctx) {
    const mode = computed<Mode>(() => (ctx.options.value.mode === 'hiking' ? 'hiking' : 'cycling'));
    const tiles = computed(() => [`https://tile.waymarkedtrails.org/${mode.value}/{z}/{x}/{y}.png`]);
    return rasterLayer(ctx, {
      tiles, maxzoom: 18,
      attribution: `Routen: <a href="https://${mode.value}.waymarkedtrails.org/" target="_blank" rel="noopener">Waymarked Trails</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-Mitwirkende</a>`,
    });
  },
});
