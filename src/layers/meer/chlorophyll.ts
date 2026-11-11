// Ocean chlorophyll-a (algae) from VIIRS NOAA-20 via NASA GIBS; log scale, clouds and swath gaps stay empty.
import { formatNumber } from '../../core/format';
import { dailyTime, gibsDaily } from '../../data/parsers/gibsdaily';
import { defineLayer } from '../define';

const LAG = 2;

export default defineLayer({
  id: 'chlorophyll',
  category: 'meer',
  title: 'Chlorophyll',
  summary: 'Algen im Meer, Chlorophyll-Gehalt der Oberfläche, vom Satelliten gemessen',
  icon: 'leaf',
  color: '#2EAD6B',
  form: 'raster',
  cadence: 'daily',
  coverage: 'Meere',
  sources: [{ name: 'NASA VIIRS NOAA-20 Chlorophyll a, GIBS', url: 'https://earthdata.nasa.gov/gibs', license: 'NASA, frei nutzbar' }],
  time: dailyTime(LAG),
  // the product is logarithmic: stops sit at log10(mg/m³) so that the bar is evenly spaced
  legend: {
    type: 'scale', unit: 'mg/m³ (logarithmisch)',
    stops: [[-2, '#93006c'], [-1.6, '#3300cc'], [-1.18, '#0050ff'], [-0.77, '#00f5ff'], [-0.36, '#00ff0f'], [0.06, '#f8ff00'], [0.47, '#ff8700'], [0.88, '#ff0700'], [1.3, '#690000']],
    ticks: [-2, -1, 0, 1], format: (v) => formatNumber(10 ** v, v < 0 ? (v < -1.5 ? 2 : 1) : 0),
  },
  keywords: ['algen', 'algenblüte', 'plankton', 'chlorophyll', 'viirs', 'meer', 'produktivität'],
  mount: (ctx) => gibsDaily(ctx, { layer: 'VIIRS_NOAA20_Chlorophyll_a', format: 'png', matrixSet: 'GoogleMapsCompatible_Level7', lag: LAG, noteSuffix: 'Lücken bei Wolken' }),
});
