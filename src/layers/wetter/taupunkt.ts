// Dew point 2 m (ICON): how much moisture the air holds, independent of the time of day.
import { formatQuantity } from '../../core/units';
import { ICON_SOURCE, forecastTime } from '../../render/gl/latest';
import { scaleLegend } from '../../render/gl/legend';
import { DEWPOINT } from '../../render/gl/scales';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'taupunkt',
  category: 'wetter',
  title: 'Taupunkt',
  summary: 'Taupunkt in 2 m Höhe: je höher, desto schwüler die Luft',
  icon: 'drop',
  color: '#5FC2B6',
  form: 'field',
  exclusive: 'field',
  cadence: 'hourly',
  sources: [ICON_SOURCE],
  time: forecastTime,
  legend: () => scaleLegend(DEWPOINT),
  keywords: ['taupunkt', 'schwül', 'feuchte', 'dew point', 'icon', 'dwd'],

  async mount(ctx) {
    const { fieldLayer } = await import('../../render/gl/field');
    return fieldLayer(ctx, {
      vars: ['dew_point_2m'],
      scale: DEWPOINT,
      label: 'Taupunkt',
      format: (v) => formatQuantity('temperature', v, { digits: 1 }),
    });
  },
});
