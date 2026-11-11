// Reference layer: raster from NASA GIBS.
import { gibsLayer } from '../../render/raster';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'nachtlichter',
  category: 'erde',
  title: 'Nachtlichter',
  summary: 'Künstliche Beleuchtung der Erde bei Nacht, Satellitenkomposit 2016',
  icon: 'moon',
  color: '#FFD479',
  form: 'raster',
  cadence: 'static',
  sources: [{ name: 'NASA Black Marble (VIIRS), GIBS', url: 'https://earthdata.nasa.gov/gibs', license: 'NASA, frei nutzbar' }],
  keywords: ['licht', 'viirs', 'black marble', 'stadt', 'night'],
  mount: (ctx) => gibsLayer(ctx, { layer: 'VIIRS_Black_Marble', format: 'png', matrixSet: 'GoogleMapsCompatible_Level8', date: '2016-01-01' }),
});
