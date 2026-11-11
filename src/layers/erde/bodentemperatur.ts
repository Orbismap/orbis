// Land surface temperature (day) from MODIS Terra via NASA GIBS; the legend follows the user's temperature unit.
import { formatNumber } from '../../core/format';
import { convert, unitLabel } from '../../core/units';
import { dailyTime, gibsDaily } from '../../data/parsers/gibsdaily';
import { defineLayer } from '../define';

const LAG = 1;
/** °C -> colour of the GIBS ramp (the product itself is in Kelvin). */
const STOPS: [number, string][] = [[-73, '#c900ff'], [-57, '#5900ff'], [-40, '#0024ff'], [-23, '#00b3ff'], [-6.5, '#33ff89'], [9.7, '#95ff00'], [26.5, '#ffff00'], [43, '#ffac00'], [60, '#ff5500'], [77, '#ff0100']];

export default defineLayer({
  id: 'bodentemperatur',
  category: 'erde',
  title: 'Bodentemperatur',
  summary: 'Oberflächentemperatur des Landes am Tag, vom Satelliten gemessen, nicht Lufttemperatur',
  icon: 'thermometer',
  color: '#FF7043',
  form: 'raster',
  cadence: 'daily',
  coverage: 'Land',
  sources: [{ name: 'NASA MODIS Terra Land Surface Temperature (Tag), GIBS', url: 'https://earthdata.nasa.gov/gibs', license: 'NASA, frei nutzbar' }],
  time: dailyTime(LAG),
  legend: () => ({
    type: 'scale', unit: unitLabel('temperature'),
    stops: STOPS.map(([v, c]) => [convert('temperature', v), c]),
    ticks: [-40, -20, 0, 20, 40, 60].map((v) => convert('temperature', v)),
    format: (v) => formatNumber(v, 0),
  }),
  keywords: ['temperatur', 'hitze', 'lst', 'boden', 'modis', 'wärme'],
  mount: (ctx) => gibsDaily(ctx, { layer: 'MODIS_Terra_Land_Surface_Temp_Day', format: 'png', matrixSet: 'GoogleMapsCompatible_Level7', lag: LAG, noteSuffix: 'Tagesüberflug, ohne Wolkenflächen' }),
});
