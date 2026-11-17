// Waymarked Trails: signposted cycling or hiking routes as raster tiles.
import { computed, effect } from '@preact/signals';
import { rasterLayer } from '../../render/raster';
import { defineLayer } from '../define';
import { multiHas } from '../multi';
import type { LayerHandle, LegendSpec } from '../types';

const MODES = {
  cycling: { label: 'Radwege', color: '#43a047' },
  hiking: { label: 'Wanderwege', color: '#e8793a' },
} as const;
type Mode = keyof typeof MODES;

export default defineLayer({
  id: 'wegenetze',
  category: 'verkehr',
  title: 'Rad- und Wanderwege',
  summary: 'Ausgeschilderte Fernrad- und Wanderrouten, Rad, Wandern oder beides',
  icon: 'map',
  color: '#43a047',
  form: 'raster',
  cadence: 'static',
  coverage: 'Welt',
  sources: [{ name: 'Waymarked Trails (OpenStreetMap-Mitwirkende)', url: 'https://waymarkedtrails.org/', license: 'CC BY-SA 3.0 / ODbL' }],
  options: [
    { id: 'mode', label: 'Art', type: 'multi', default: 'all', choices: [{ value: 'all', label: 'Alle' }, { value: 'cycling', label: 'Radwege' }, { value: 'hiking', label: 'Wanderwege' }] },
  ],
  legend: (o): LegendSpec => ({
    type: 'classes',
    items: [
      ...(multiHas(o.mode, 'cycling')
        ? [{ color: '#2d6cdf', label: 'Internationale und nationale Radrouten', shape: 'line' as const }, { color: '#e03a3a', label: 'Regionale Radrouten', shape: 'line' as const }, { color: '#43a047', label: 'Lokale Radrouten', shape: 'line' as const }]
        : []),
      ...(multiHas(o.mode, 'hiking') ? [{ color: '#e8793a', label: 'Wanderrouten (Weltweit, regional, lokal)', shape: 'line' as const }] : []),
    ],
  }),
  keywords: ['radweg', 'wanderweg', 'radroute', 'wandern', 'fahrrad', 'cycling', 'hiking', 'waymarked trails', 'eurovelo', 'fernwanderweg'],

  mount(ctx) {
    // one raster layer per chosen mode; both together lie on top of each other
    const modes = computed(() => (Object.keys(MODES) as Mode[]).filter((m) => multiHas(ctx.options.value.mode, m)).join(','));
    const handles = new Map<Mode, LayerHandle>();
    const stop = effect(() => {
      const want = new Set(modes.value.split(',').filter(Boolean) as Mode[]);
      for (const [m, h] of handles) if (!want.has(m)) { h.destroy(); handles.delete(m); }
      for (const m of want) {
        if (handles.has(m)) continue;
        handles.set(m, rasterLayer(ctx, {
          name: m, tiles: [`https://tile.waymarkedtrails.org/${m}/{z}/{x}/{y}.png`], maxzoom: 18,
          attribution: `Routen: <a href="https://${m}.waymarkedtrails.org/" target="_blank" rel="noopener">Waymarked Trails</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-Mitwirkende</a>`,
        }));
      }
    });
    return { destroy: () => { stop(); for (const h of handles.values()) h.destroy(); handles.clear(); } };
  },
});
