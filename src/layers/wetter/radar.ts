// Rain radar (RainViewer composite, world). Not exclusive with the model fields: radar is an observation and is
// meant to be laid over a model field (clouds, wind) or the satellite basemap.
import { computed } from '@preact/signals';
import { HOUR, MINUTE } from '../../core/time';
import type { RasterFrame } from '../../render/gl/raster-frames';
import { defineLayer } from '../define';

interface RainViewer { host: string; radar: { past: { time: number; path: string }[]; nowcast?: { time: number; path: string }[] } }

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
    items: [
      { color: '#88DDEE', label: 'leicht', shape: 'square' },
      { color: '#0099CC', label: 'mäßig', shape: 'square' },
      { color: '#005588', label: 'stark', shape: 'square' },
      { color: '#FFEE00', label: 'sehr stark', shape: 'square' },
      { color: '#FF6600', label: 'Starkregen', shape: 'square' },
      { color: '#DD0000', label: 'Unwetter', shape: 'square' },
    ],
  },
  keywords: ['radar', 'regen', 'niederschlag', 'rainviewer', 'schauer'],

  async mount(ctx) {
    const { rasterFrames } = await import('../../render/gl/raster-frames');
    const res = ctx.resource<RainViewer>({
      key: 'rainviewer:maps',
      url: 'https://api.rainviewer.com/public/weather-maps.json',
      refresh: 5 * MINUTE,
    });
    // colour scheme 2 (universal blue), smoothed, snow shown; the free tier serves tiles up to zoom 7: MapLibre overzooms
    const frames = computed<RasterFrame[]>(() => {
      const d = res.data.value;
      if (!d) return [];
      return [...d.radar.past, ...(d.radar.nowcast ?? [])].map((f) => ({ time: f.time * 1000, tiles: [`${d.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`] }));
    });
    const failure = computed(() => (res.state.value === 'error' && !res.data.value ? 'RainViewer ist nicht erreichbar, das Radar kann gerade nicht geladen werden' : undefined));
    const h = rasterFrames(ctx, {
      frames, failure, sourceName: 'RainViewer', maxzoom: 7, maxGap: 20 * MINUTE,
      attribution: 'Radar: <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>',
    });
    ctx.status({ state: 'loading' });
    return h;
  },
});
