// Snow cover (NDSI) from MODIS Terra via NASA GIBS, daily; cloudy and snow-free pixels stay transparent.
import { dailyTime, gibsDaily } from '../../data/parsers/gibsdaily';
import { defineLayer } from '../define';

const LAG = 1;

export default defineLayer({
  id: 'schneedecke',
  category: 'erde',
  title: 'Schneedecke',
  summary: 'Schneebedeckte Landflächen laut Satellit Terra, Wolken und schneefreies Land bleiben leer',
  icon: 'snow',
  color: '#B3E5FC',
  form: 'raster',
  cadence: 'daily',
  coverage: 'Land',
  sources: [{ name: 'NASA MODIS Terra NDSI Snow Cover, GIBS', url: 'https://earthdata.nasa.gov/gibs', license: 'NASA, frei nutzbar' }],
  time: dailyTime(LAG),
  legend: {
    type: 'scale', unit: 'Schneeindex NDSI (höher = sicherer Schnee)',
    stops: [[1, '#f0f088'], [20, '#f0f093'], [40, '#f0d293'], [60, '#f0b493'], [80, '#f09693'], [100, '#f08383']],
    ticks: [1, 25, 50, 75, 100],
  },
  keywords: ['schnee', 'eis', 'snow', 'ndsi', 'modis', 'winter'],
  mount: (ctx) => gibsDaily(ctx, { layer: 'MODIS_Terra_NDSI_Snow_Cover', format: 'png', matrixSet: 'GoogleMapsCompatible_Level8', lag: LAG, noteSuffix: 'ohne Wolkenflächen' }),
});
