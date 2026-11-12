// Rain radar (RainViewer composite, world), drawn by the radar shader kit (render/gl/radarLayer.ts). Not exclusive with the model fields: radar is an observation and is
// meant to be laid over a model field (clouds, wind) or the satellite basemap.
import { computed } from '@preact/signals';
import { HOUR, MINUTE } from '../../core/time';
import { rateColor } from '../../render/gl/radar-values';
import type { RadarFrame } from '../../render/gl/radarLayer';
import { defineLayer } from '../define';

interface RainViewer { host: string; radar: { past: { time: number; path: string }[]; nowcast?: { time: number; path: string }[] } }

/** Colour scale of the radar shader, rain rate in mm/h (log scale, see render/gl/radar-values.ts). */
const RADAR_LEGEND: [number, string][] = [
  [0.05, '0,05 mm/h, Niesel'], [0.6, '0,6 mm/h, leicht'], [1.5, '1,5 mm/h, mäßig'], [3, '3 mm/h'], [6, '6 mm/h, stark'],
  [10, '10 mm/h'], [20, '20 mm/h, Starkregen'], [40, '40 mm/h'], [80, '80 mm/h, Unwetter'],
];

export default defineLayer({
  id: 'radar',
  category: 'wetter',
  title: 'Regenradar',
  summary: 'Gemessener Niederschlag der letzten zwei Stunden, weltweit',
  icon: 'radar',
  color: '#4A9BE8',
  form: 'raster',
  cadence: 'minutes',
  coverage: 'Welt',
  sources: [{ name: 'RainViewer', url: 'https://www.rainviewer.com/', license: 'RainViewer, Quellenangabe (kostenlose Stufe)' }],
  time: { mode: 'frames', range: () => ({ start: -2 * HOUR, end: 0, step: 10 * MINUTE }) },
  legend: {
    type: 'classes',
    items: RADAR_LEGEND.map(([mmh, label]) => {
      const [r, g, b] = rateColor(mmh);
      return { color: `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`, label, shape: 'square' as const };
    }),
  },
  keywords: ['radar', 'regen', 'niederschlag', 'rainviewer', 'schauer'],

  async mount(ctx) {
    const { radarLayer } = await import('../../render/gl/radarLayer');
    const res = ctx.resource<RainViewer>({
      key: 'rainviewer:maps',
      url: 'https://api.rainviewer.com/public/weather-maps.json',
      refresh: 5 * MINUTE,
    });
    // colour scheme 2 (universal blue), smoothed, no snow: the colours are read back into rain rates (radar-values.ts).
    // The free tier serves tiles up to zoom 7; the kit never asks for more.
    const frames = computed<RadarFrame[]>(() => {
      const d = res.data.value;
      if (!d) return [];
      return [...d.radar.past, ...(d.radar.nowcast ?? [])].map((f) => ({ time: f.time * 1000, url: `${d.host}${f.path}/256/{z}/{x}/{y}/2/1_0.png` }));
    });
    const failure = computed(() => (res.state.value === 'error' && !res.data.value ? 'RainViewer ist nicht erreichbar, das Radar kann gerade nicht geladen werden' : undefined));
    const h = radarLayer(ctx, {
      frames, failure, sourceName: 'RainViewer', maxzoom: 7, maxGap: 20 * MINUTE,
      attribution: 'Radar: <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>',
    });
    ctx.status({ state: 'loading' });
    return h;
  },
});
