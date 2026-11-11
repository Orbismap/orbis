// Wind gusts 10 m (ICON): maximum of the last three hours.
import { formatQuantity } from '../../core/units';
import { ICON_SOURCE, forecastTime } from '../../render/gl/latest';
import { scaleLegend } from '../../render/gl/legend';
import { GUSTS } from '../../render/gl/scales';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'boeen',
  category: 'wetter',
  title: 'Böen',
  summary: 'Stärkste Windböen der letzten drei Stunden in 10 m Höhe',
  icon: 'storm',
  color: '#E7B25A',
  form: 'field',
  exclusive: 'field',
  cadence: 'hourly',
  sources: [ICON_SOURCE],
  time: forecastTime,
  legend: () => scaleLegend(GUSTS),
  keywords: ['böen', 'sturm', 'orkan', 'windspitzen', 'gusts', 'icon', 'dwd'],

  async mount(ctx) {
    const { fieldLayer } = await import('../../render/gl/field');
    return fieldLayer(ctx, {
      vars: ['wind_gusts_10m'],
      scale: GUSTS,
      label: 'Böen',
      format: (v) => formatQuantity('wind', v),
    });
  },
});
