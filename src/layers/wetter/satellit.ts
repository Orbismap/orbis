// Cloud imagery in the infrared (EUMETSAT multi-satellite world composite, a new scan every 3 hours).
import { computed } from '@preact/signals';
import { HOUR } from '../../core/time';
import { rasterFrames, type RasterFrame } from '../../render/gl/raster-frames';
import { defineLayer } from '../define';

const WMS = 'https://view.eumetsat.int/geoserver/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=mumi:worldcloudmap_ir108&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

export default defineLayer({
  id: 'satellit',
  category: 'wetter',
  title: 'Satellitenbild Wolken',
  summary: 'Wolken im Infrarot, aus Wettersatelliten zusammengesetzt',
  icon: 'satellite',
  color: '#B9C7DA',
  form: 'raster',
  cadence: 'hourly',
  coverage: 'Welt',
  sources: [{ name: 'EUMETSAT View', url: 'https://view.eumetsat.int/', license: 'EUMETSAT, Quellenangabe' }],
  time: { mode: 'frames', range: () => ({ start: -12 * HOUR, end: 0, step: 3 * HOUR }) },
  keywords: ['satellit', 'wolken', 'infrarot', 'eumetsat', 'meteosat'],

  mount(ctx) {
    const frames = computed<RasterFrame[]>(() => {
      const step = 3 * HOUR;
      const last = Math.floor((Date.now() - 2 * HOUR) / step) * step; // published about two hours after the scan
      return Array.from({ length: 5 }, (_, i) => {
        const t = last - (4 - i) * step;
        return { time: t, tiles: [`${WMS}&TIME=${new Date(t).toISOString().slice(0, 19)}Z`] };
      });
    });
    return rasterFrames(ctx, {
      frames, sourceName: 'EUMETSAT', maxzoom: 7, maxGap: 4 * HOUR,
      attribution: 'Satellit: © <a href="https://view.eumetsat.int/" target="_blank" rel="noopener">EUMETSAT</a>',
    });
  },
});
