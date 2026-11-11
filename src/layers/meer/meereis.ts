// Sea ice concentration, GHRSST MUR L4 via NASA GIBS (Arctic and Antarctic).
import { dailyTime, gibsDaily } from '../../data/parsers/gibsdaily';
import { defineLayer } from '../define';

const LAG = 2;

export default defineLayer({
  id: 'meereis',
  category: 'meer',
  title: 'Meereis',
  summary: 'Wie viel Prozent der Meeresfläche von Eis bedeckt sind, Arktis und Antarktis',
  icon: 'ice',
  color: '#B3E5FC',
  form: 'raster',
  cadence: 'daily',
  coverage: 'Polargebiete',
  sources: [{ name: 'GHRSST MUR L4 Sea Ice Concentration (NASA JPL PO.DAAC), GIBS', url: 'https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1', license: 'NASA, frei nutzbar' }],
  time: dailyTime(LAG),
  legend: {
    type: 'scale', unit: 'Eisbedeckung in %',
    stops: [[0, '#111111'], [12, '#c600c6'], [25, '#5c00ff'], [38, '#0094ff'], [50, '#00d98e'], [62, '#44c100'], [75, '#ffd400'], [88, '#ff0909'], [100, '#ffffff']],
    ticks: [0, 25, 50, 75, 100],
  },
  keywords: ['eis', 'arktis', 'antarktis', 'polar', 'meereis', 'sea ice', 'packeis'],
  mount: (ctx) => gibsDaily(ctx, { layer: 'GHRSST_L4_MUR_Sea_Ice_Concentration', format: 'png', matrixSet: 'GoogleMapsCompatible_Level7', lag: LAG, noteSuffix: 'Tagesanalyse' }),
});
