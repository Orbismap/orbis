// Apparent temperature ("gefühlte Temperatur"): derived in the shader from T, dew point (humidity) and wind,
// Steadman / Australian BoM formula as in the old Orbis; same colour scale as the temperature.
import { computed } from '@preact/signals';
import { formatQuantity } from '../../core/units';
import { DEM_SOURCE, ICON_SOURCE, forecastTime } from '../../render/gl/latest';
import { scaleLegend } from '../../render/gl/legend';
import { TEMPERATURE } from '../../render/gl/scales';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'gefuehlt',
  category: 'wetter',
  title: 'Gefühlte Temperatur',
  summary: 'Wie warm oder kalt es sich anfühlt: Temperatur, Luftfeuchte und Wind zusammen',
  icon: 'thermometer',
  color: '#F2874A',
  form: 'field',
  exclusive: 'field',
  cadence: 'hourly',
  sources: [ICON_SOURCE, DEM_SOURCE],
  time: forecastTime,
  options: [
    { id: 'nullgrad', label: '0-°C-Linie', type: 'toggle', default: false },
    { id: 'gelaende', label: 'Geländekorrektur', type: 'toggle', default: true },
  ],
  legend: () => scaleLegend(TEMPERATURE),
  keywords: ['gefühlte temperatur', 'gefühlt', 'windchill', 'hitzeindex', 'schwül', 'apparent', 'feels like', 'icon', 'dwd'],

  async mount(ctx) {
    const { fieldLayer } = await import('../../render/gl/field');
    return fieldLayer(ctx, {
      vars: ['temperature_2m', 'dew_point_2m', 'u', 'v'],
      mode: 'feels',
      scale: TEMPERATURE,
      label: 'Gefühlte Temperatur',
      format: (v) => formatQuantity('temperature', v, { digits: 1 }),
      terrain: { enabled: computed(() => ctx.options.value.gelaende !== false) },
      contours: computed(() => (ctx.options.value.nullgrad ? { interval: 1000, width: 1.3, alpha: 0.8 } : undefined)),
    });
  },
});
