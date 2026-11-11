// Daily true-colour image from VIIRS (NOAA-20) via NASA GIBS; timeline over the last 14 days.
import { dailyTime, gibsDaily } from '../../data/parsers/gibsdaily';
import { defineLayer } from '../define';

const LAG = 1;

export default defineLayer({
  id: 'satellitenbild',
  category: 'erde',
  title: 'Satellitenbild',
  summary: 'Die Erde in Echtfarben, aufgenommen vom Satelliten NOAA-20, Tag für Tag',
  icon: 'satellite',
  color: '#8FDCFF',
  form: 'raster',
  cadence: 'daily',
  sources: [{ name: 'NASA VIIRS NOAA-20 Corrected Reflectance (True Color), GIBS', url: 'https://earthdata.nasa.gov/gibs', license: 'NASA, frei nutzbar' }],
  time: dailyTime(LAG),
  keywords: ['satellit', 'foto', 'wolken', 'viirs', 'true color', 'echtfarben', 'tagesbild'],
  mount: (ctx) => gibsDaily(ctx, { layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', format: 'jpg', matrixSet: 'GoogleMapsCompatible_Level9', lag: LAG, noteSuffix: 'Lücken zwischen den Bahnen' }),
});
