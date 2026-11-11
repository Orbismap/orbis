// Temperature 2 m (ICON), diverging scale around 0 °C with an optional freezing line.
import { computed } from '@preact/signals';
import { formatQuantity } from '../../core/units';
import { ICON_SOURCE, forecastTime } from '../../render/gl/latest';
import { scaleLegend } from '../../render/gl/legend';
import { TEMPERATURE } from '../../render/gl/scales';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'temperatur',
  category: 'wetter',
  title: 'Temperatur',
  summary: 'Lufttemperatur in 2 m Höhe, Vorhersage für 72 Stunden',
  icon: 'thermometer',
  color: '#F7B84A',
  form: 'field',
  exclusive: 'field',
  cadence: 'hourly',
  sources: [ICON_SOURCE],
  time: forecastTime,
  options: [{ id: 'nullgrad', label: '0-°C-Linie', type: 'toggle', default: true }],
  legend: () => scaleLegend(TEMPERATURE),
  keywords: ['temperatur', 'wärme', 'kälte', 'frost', 'grad', 'icon', 'dwd'],

  async mount(ctx) {
    const { fieldLayer } = await import('../../render/gl/field');
    return fieldLayer(ctx, {
      vars: ['temperature_2m'],
      scale: TEMPERATURE,
      label: 'Temperatur',
      format: (v) => formatQuantity('temperature', v, { digits: 1 }),
      contours: computed(() => (ctx.options.value.nullgrad ? { interval: 1000, width: 1.3, alpha: 0.8 } : undefined)),
    });
  },
});
