// ESA WorldCover 2021 (10 m) via the Terrascope WMTS; tiles exist from zoom 6.
import { rasterLayer } from '../../render/raster';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'landbedeckung',
  category: 'erde',
  title: 'Landbedeckung',
  summary: 'Wald, Acker, Siedlung und Wasser in 10 m Auflösung, Stand 2021',
  icon: 'map',
  color: '#4CAF50',
  form: 'raster',
  cadence: 'static',
  coverage: 'Welt (60° S bis 82° N)',
  minZoom: 6,
  sources: [{ name: 'ESA WorldCover 2021 v2, Terrascope', url: 'https://esa-worldcover.org/', license: 'CC BY 4.0, © ESA WorldCover project / Contains modified Copernicus Sentinel data' }],
  legend: {
    type: 'classes',
    items: [
      { color: '#006400', label: 'Wald', shape: 'square' },
      { color: '#ffbb22', label: 'Gebüsch', shape: 'square' },
      { color: '#ffff4c', label: 'Grünland', shape: 'square' },
      { color: '#f096ff', label: 'Ackerland', shape: 'square' },
      { color: '#fa0000', label: 'Siedlung', shape: 'square' },
      { color: '#b4b4b4', label: 'Fels, Sand, kaum Bewuchs', shape: 'square' },
      { color: '#f0f0f0', label: 'Schnee und Eis', shape: 'square' },
      { color: '#0064c8', label: 'Gewässer', shape: 'square' },
      { color: '#0096a0', label: 'Feuchtgebiet', shape: 'square' },
      { color: '#00cf75', label: 'Mangroven', shape: 'square' },
      { color: '#fae6a0', label: 'Moos und Flechten', shape: 'square' },
    ],
  },
  keywords: ['wald', 'acker', 'siedlung', 'worldcover', 'esa', 'landnutzung', 'landcover', 'bebauung'],
  mount: (ctx) =>
    rasterLayer(ctx, {
      tiles: ['https://wmts.terrascope.be/?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=esa-worldcover-map-10m-2021-v2_map&STYLE=default&FORMAT=image/png&TILEMATRIXSET=EPSG:3857&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&TIME=2021-01-01'],
      tileSize: 256, minzoom: 6, maxzoom: 14,
      attribution: '© <a href="https://esa-worldcover.org/" target="_blank" rel="noopener">ESA WorldCover</a> 2021 (CC BY 4.0)',
    }),
});
