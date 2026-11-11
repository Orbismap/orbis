// Rain radar Germany (DWD composite via WMS, 5 min, 1 km).
import { computed } from '@preact/signals';
import { HOUR, MINUTE } from '../../core/time';
import { rasterFrames, type RasterFrame } from '../../render/gl/raster-frames';
import { ensureCleanRasterProtocol } from '../../map/clean-raster-protocol';
import { defineLayer } from '../define';

const WMS = 'https://maps.dwd.de/geoserver/dwd/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=dwd:Niederschlagsradar&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

export default defineLayer({
  id: 'radar-de',
  category: 'wetter',
  title: 'Regenradar Deutschland',
  summary: 'Niederschlag in Deutschland, 1 km, alle 5 Minuten',
  icon: 'radar',
  color: '#7B5CE0',
  form: 'raster',
  cadence: 'minutes',
  coverage: 'DE',
  sources: [{ name: 'Deutscher Wetterdienst, Radarverbund', url: 'https://www.dwd.de/', license: 'CC BY 4.0' }],
  time: { mode: 'frames', range: () => ({ start: -2 * HOUR, end: 0, step: 5 * MINUTE }) },
  legend: {
    type: 'classes',
    items: [
      { color: '#99CCFF', label: 'leicht', shape: 'square' },
      { color: '#3366FF', label: 'mäßig', shape: 'square' },
      { color: '#00AA44', label: 'stark', shape: 'square' },
      { color: '#FFDD00', label: 'sehr stark', shape: 'square' },
      { color: '#FF3300', label: 'Starkregen', shape: 'square' },
      { color: '#AA00AA', label: 'Unwetter', shape: 'square' },
    ],
  },
  keywords: ['radar', 'regen', 'dwd', 'deutschland', 'niederschlag'],

  mount(ctx) {
    ensureCleanRasterProtocol(); // strips the grey domain fill and magenta outline of the DWD default style
    const frames = computed<RasterFrame[]>(() => {
      const step = 5 * MINUTE;
      const last = Math.floor((Date.now() - 6 * MINUTE) / step) * step; // newest scan is published a few minutes late
      return Array.from({ length: 24 }, (_, i) => {
        const t = last - (23 - i) * step;
        return { time: t, tiles: [`orbis-clean://${encodeURIComponent(`${WMS}&TIME=${new Date(t).toISOString().slice(0, 19)}Z`).replace(/%7Bbbox-epsg-3857%7D/g, '{bbox-epsg-3857}')}`] };
      });
    });
    return rasterFrames(ctx, {
      frames, sourceName: 'DWD-Radar', maxzoom: 10, maxGap: 15 * MINUTE,
      attribution: 'Radar: © <a href="https://www.dwd.de/" target="_blank" rel="noopener">DWD</a> (CC BY 4.0)',
    });
  },
});
