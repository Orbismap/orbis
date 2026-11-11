// Bathymetry: EMODnet Bathymetry (Europe and North Atlantic, ocean only) via WMS. GEBCO's WMS answers Chrome with an
// XML error instead of a PNG at the moment, so the global source is not used.
import { formatInt } from '../../core/format';
import { rasterLayer } from '../../render/raster';
import { defineLayer } from '../define';

/** The product's ramp is non-linear: stops sit at equal steps, the labels name the depths. */
const DEPTHS = [0, 10, 50, 150, 450, 1000, 2000, 3500, 6000];

export default defineLayer({
  id: 'meerestiefe',
  category: 'meer',
  title: 'Meerestiefe',
  summary: 'Tiefe des Meeresbodens in Europa und im Nordatlantik, nur Meer, nicht zur Navigation',
  icon: 'anchor',
  color: '#24CECC',
  form: 'raster',
  cadence: 'static',
  coverage: 'Europa, Nordatlantik',
  sources: [{ name: 'EMODnet Bathymetry (Digitales Geländemodell)', url: 'https://emodnet.ec.europa.eu/en/bathymetry', license: 'CC BY 4.0, EMODnet Bathymetry Consortium' }],
  legend: {
    type: 'scale', unit: 'Wassertiefe in m',
    stops: [[0, '#ff6065'], [1, '#f91122'], [2, '#fff200'], [3, '#bedc30'], [4, '#64ee3a'], [5, '#24cecc'], [6, '#0014f5'], [7, '#000042'], [8, '#00003e']],
    ticks: DEPTHS.map((_, i) => i), format: (v) => formatInt(DEPTHS[Math.round(v)] ?? 0),
  },
  keywords: ['tiefe', 'bathymetrie', 'emodnet', 'meeresboden', 'nordsee', 'ostsee', 'mittelmeer', 'seekarte'],
  mount: (ctx) =>
    rasterLayer(ctx, {
      wms: { url: 'https://ows.emodnet-bathymetry.eu/wms', layers: 'emodnet:mean_multicolour', version: '1.3.0', format: 'image/png' },
      tileSize: 256, maxzoom: 11, bounds: [-73.125, 5.625, 45, 90],
      attribution: 'Meerestiefe: <a href="https://emodnet.ec.europa.eu/en/bathymetry" target="_blank" rel="noopener">EMODnet Bathymetry</a> (CC BY 4.0, nicht zur Navigation)',
    }),
});
