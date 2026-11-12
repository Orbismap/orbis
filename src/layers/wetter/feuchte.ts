// Relative humidity (derived in the shader from temperature and dew point, Magnus formula).
import { computed } from '@preact/signals';
import { formatWithUnit } from '../../core/format';
import { DEM_SOURCE, ICON_SOURCE, forecastTime } from '../../render/gl/latest';
import { scaleLegend } from '../../render/gl/legend';
import { HUMIDITY } from '../../render/gl/scales';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'feuchte',
  category: 'wetter',
  title: 'Relative Feuchte',
  summary: 'Relative Luftfeuchte in 2 m Höhe, aus Temperatur und Taupunkt berechnet',
  icon: 'drop',
  color: '#3D9AD1',
  form: 'field',
  exclusive: 'field',
  cadence: 'hourly',
  sources: [ICON_SOURCE, DEM_SOURCE],
  time: forecastTime,
  options: [{ id: 'gelaende', label: 'Geländekorrektur', type: 'toggle', default: true }],
  legend: () => scaleLegend(HUMIDITY),
  keywords: ['feuchte', 'luftfeuchtigkeit', 'humidity', 'trocken', 'icon', 'dwd'],

  async mount(ctx) {
    const { fieldLayer } = await import('../../render/gl/field');
    return fieldLayer(ctx, {
      vars: ['temperature_2m', 'dew_point_2m'],
      mode: 'humidity',
      scale: HUMIDITY,
      label: 'Relative Feuchte',
      terrain: { enabled: computed(() => ctx.options.value.gelaende !== false) },
      format: (v) => formatWithUnit(Math.round(v), '%'),
    });
  },
});
