// Sea surface temperature, GHRSST MUR L4 (1 km, gap-free analysis) via NASA GIBS; legend follows the user's unit.
import { formatNumber } from '../../core/format';
import { convert, unitLabel } from '../../core/units';
import { dailyTime, gibsDaily } from '../../data/parsers/gibsdaily';
import { SST_STOPS } from '../../data/parsers/ramps';
import { defineLayer } from '../define';

const LAG = 2;

export default defineLayer({
  id: 'meerestemperatur',
  category: 'meer',
  title: 'Meerestemperatur',
  summary: 'Temperatur der Meeresoberfläche, wolkenfrei berechnet aus mehreren Satelliten',
  icon: 'thermometer',
  color: '#FF9900',
  form: 'raster',
  cadence: 'daily',
  coverage: 'Meere',
  sources: [{ name: 'GHRSST MUR L4 (NASA JPL PO.DAAC), GIBS', url: 'https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1', license: 'NASA, frei nutzbar' }],
  time: dailyTime(LAG),
  legend: () => ({
    type: 'scale', unit: unitLabel('temperature'),
    stops: SST_STOPS.map(([v, c]) => [convert('temperature', v), c]),
    ticks: [0, 5, 10, 15, 20, 25, 30].map((v) => convert('temperature', v)),
    format: (v) => formatNumber(v, 0),
  }),
  keywords: ['sst', 'wassertemperatur', 'meer', 'ozean', 'el niño', 'mur', 'ghrsst', 'badetemperatur'],
  mount: (ctx) => gibsDaily(ctx, { layer: 'GHRSST_L4_MUR_Sea_Surface_Temperature', format: 'png', matrixSet: 'GoogleMapsCompatible_Level7', lag: LAG, noteSuffix: 'Tagesanalyse' }),
});
