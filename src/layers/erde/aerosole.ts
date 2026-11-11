// Aerosol optical depth (MODIS Terra+Aqua combined, value added) via NASA GIBS, daily.
import { formatNumber } from '../../core/format';
import { dailyTime, gibsDaily } from '../../data/parsers/gibsdaily';
import { defineLayer } from '../define';

const LAG = 2;

export default defineLayer({
  id: 'aerosole',
  category: 'erde',
  title: 'Aerosole & Staub',
  summary: 'Trübung der Luft durch Dunst, Rauch und Wüstenstaub, Satellitenmessung des Vortags',
  icon: 'cloud',
  color: '#E0A060',
  form: 'raster',
  cadence: 'daily',
  sources: [{ name: 'NASA MODIS Aerosol Optical Depth (Terra+Aqua), GIBS', url: 'https://earthdata.nasa.gov/gibs', license: 'NASA, frei nutzbar' }],
  time: dailyTime(LAG),
  legend: {
    type: 'scale', unit: 'Aerosol-Dicke AOD bei 550 nm (über 1 = starker Rauch oder Staub)',
    stops: [[0, '#fffdcd'], [0.09, '#ffe77b'], [0.185, '#ffcb4e'], [0.28, '#ff9e2d'], [0.375, '#ff701e'], [0.465, '#fc3a12'], [0.56, '#e3110b'], [0.655, '#b8000e'], [1, '#7d000e']],
    ticks: [0, 0.25, 0.5, 0.75, 1], format: (v) => formatNumber(v, 2),
  },
  keywords: ['aerosol', 'staub', 'saharastaub', 'rauch', 'dunst', 'aod', 'modis', 'luft'],
  mount: (ctx) => gibsDaily(ctx, { layer: 'MODIS_Combined_Value_Added_AOD', format: 'png', matrixSet: 'GoogleMapsCompatible_Level6', lag: LAG, noteSuffix: 'Lücken bei Wolken' }),
});
