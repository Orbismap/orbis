// Total cloud cover (ICON): white veil that thickens with coverage.
import { formatWithUnit } from '../../core/format';
import { ICON_SOURCE, forecastTime } from '../../render/gl/latest';
import { scaleLegend } from '../../render/gl/legend';
import { CLOUD } from '../../render/gl/scales';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'bewoelkung',
  category: 'wetter',
  title: 'Bewölkung',
  summary: 'Wolkenbedeckung des Himmels in Prozent',
  icon: 'cloud',
  color: '#DCE6F4',
  form: 'field',
  exclusive: 'field',
  cadence: 'hourly',
  sources: [ICON_SOURCE],
  time: forecastTime,
  legend: () => scaleLegend(CLOUD),
  keywords: ['wolken', 'bewölkung', 'bedeckung', 'cloud', 'icon', 'dwd'],

  async mount(ctx) {
    const { fieldLayer } = await import('../../render/gl/field');
    return fieldLayer(ctx, {
      vars: ['cloud_cover'],
      scale: CLOUD,
      label: 'Bewölkung',
      format: (v) => formatWithUnit(Math.round(v), '%'),
    });
  },
});
