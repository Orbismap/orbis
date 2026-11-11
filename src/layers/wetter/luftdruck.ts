// Mean sea level pressure (ICON) with isobars every 4 hPa, stronger every 20 hPa.
import { computed } from '@preact/signals';
import { formatQuantity } from '../../core/units';
import { ICON_SOURCE, forecastTime } from '../../render/gl/latest';
import { scaleLegend } from '../../render/gl/legend';
import { PRESSURE } from '../../render/gl/scales';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'luftdruck',
  category: 'wetter',
  title: 'Luftdruck',
  summary: 'Luftdruck auf Meereshöhe mit Isobaren',
  icon: 'pressure',
  color: '#8E7CF0',
  form: 'field',
  exclusive: 'field',
  cadence: 'hourly',
  sources: [ICON_SOURCE],
  time: forecastTime,
  options: [{ id: 'isobaren', label: 'Isobaren', type: 'toggle', default: true }],
  legend: () => scaleLegend(PRESSURE),
  keywords: ['luftdruck', 'hoch', 'tief', 'isobaren', 'pressure', 'icon', 'dwd'],

  async mount(ctx) {
    const { fieldLayer } = await import('../../render/gl/field');
    return fieldLayer(ctx, {
      vars: ['pressure_msl'],
      scale: PRESSURE,
      label: 'Luftdruck',
      format: (v) => formatQuantity('pressure', v, { digits: 1 }),
      contours: computed(() => (ctx.options.value.isobaren ? { interval: 4, width: 1, alpha: 0.5, major: { every: 5, width: 1.6, alpha: 0.85 } } : undefined)),
    });
  },
});
