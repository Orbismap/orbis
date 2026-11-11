// Geological map of the world from Macrostrat (tiles get more detailed when zooming in).
import { rasterLayer } from '../../render/raster';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'geologie',
  category: 'erde',
  title: 'Geologie',
  summary: 'Geologische Karte der Erde, Gesteine nach Alter eingefärbt, beim Zoomen immer genauer',
  icon: 'mountain',
  color: '#AB47BC',
  form: 'raster',
  cadence: 'static',
  sources: [{ name: 'Macrostrat', url: 'https://macrostrat.org/', license: 'CC BY 4.0' }],
  legend: {
    type: 'classes',
    items: [
      { color: '#f9f97f', label: 'Quartär (jünger als 2,6 Mio. Jahre)', shape: 'square' },
      { color: '#ffe619', label: 'Neogen', shape: 'square' },
      { color: '#fd9a52', label: 'Paläogen', shape: 'square' },
      { color: '#7fc64e', label: 'Kreide', shape: 'square' },
      { color: '#34b2c9', label: 'Jura', shape: 'square' },
      { color: '#812b92', label: 'Trias', shape: 'square' },
      { color: '#99c08d', label: 'Paläozoikum', shape: 'square' },
      { color: '#f74370', label: 'Präkambrium (älter als 539 Mio. Jahre)', shape: 'square' },
    ],
  },
  keywords: ['gestein', 'geologie', 'macrostrat', 'untergrund', 'formation', 'erdzeitalter'],
  mount: (ctx) =>
    rasterLayer(ctx, {
      tiles: ['https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png'],
      tileSize: 256, maxzoom: 18,
      attribution: 'Geologie: <a href="https://macrostrat.org/" target="_blank" rel="noopener">Macrostrat</a> (CC BY 4.0)',
    }),
});
