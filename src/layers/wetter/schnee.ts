// Snow depth (ICON).
import { formatNumber } from '../../core/format';
import { ICON_SOURCE, forecastTime } from '../../render/gl/latest';
import { scaleLegend } from '../../render/gl/legend';
import { SNOW } from '../../render/gl/scales';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'schnee',
  category: 'wetter',
  title: 'Schneehöhe',
  summary: 'Höhe der Schneedecke laut Modell',
  icon: 'snow',
  color: '#B6C8FF',
  form: 'field',
  exclusive: 'field',
  cadence: 'hourly',
  sources: [ICON_SOURCE],
  time: forecastTime,
  legend: () => scaleLegend(SNOW),
  keywords: ['schnee', 'schneehöhe', 'schneedecke', 'snow', 'icon', 'dwd'],

  async mount(ctx) {
    const { fieldLayer } = await import('../../render/gl/field');
    return fieldLayer(ctx, {
      vars: ['snow_depth'],
      scale: SNOW,
      label: 'Schneehöhe',
      format: (v) => (v < 0.01 ? 'kein Schnee' : v < 1 ? `${formatNumber(v * 100, 0)} cm` : `${formatNumber(v, 2)} m`),
    });
  },
});
