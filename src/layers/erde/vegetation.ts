// NDVI from MODIS Terra via NASA GIBS (rolling 8-day composite, one frame per day).
import { formatNumber } from '../../core/format';
import { dailyTime, gibsDaily } from '../../data/parsers/gibsdaily';
import { defineLayer } from '../define';

const LAG = 2;

export default defineLayer({
  id: 'vegetation',
  category: 'erde',
  title: 'Vegetation',
  summary: 'Grüne Pflanzendecke der Landflächen, 8-Tage-Mittel des Satelliten Terra',
  icon: 'leaf',
  color: '#66BB6A',
  form: 'raster',
  cadence: 'daily',
  coverage: 'Land',
  sources: [{ name: 'NASA MODIS Terra NDVI (8-Tage), GIBS', url: 'https://earthdata.nasa.gov/gibs', license: 'NASA, frei nutzbar' }],
  time: dailyTime(LAG),
  legend: {
    type: 'scale', unit: 'NDVI (0 = kahl, 1 = dichter Bewuchs)',
    stops: [[0, '#f1ecec'], [0.085, '#e1d2c6'], [0.175, '#b4a596'], [0.26, '#a18063'], [0.375, '#96ba20'], [0.5025, '#56a101'], [0.64, '#2e8000'], [0.82, '#006400'], [0.99, '#001801']],
    ticks: [0, 0.2, 0.4, 0.6, 0.8, 1], format: (v) => formatNumber(v, 1),
  },
  keywords: ['ndvi', 'pflanzen', 'grün', 'wald', 'modis', 'vegetation', 'bewuchs'],
  mount: (ctx) => gibsDaily(ctx, { layer: 'MODIS_Terra_NDVI_8Day', format: 'png', matrixSet: 'GoogleMapsCompatible_Level9', lag: LAG, noteSuffix: '8-Tage-Mittel' }),
});
