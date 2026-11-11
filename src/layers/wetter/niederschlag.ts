// Precipitation rate (ICON): soft alpha ramp so that the basemap shows through light rain.
import { formatQuantity } from '../../core/units';
import { ICON_SOURCE, forecastTime } from '../../render/gl/latest';
import { scaleLegend } from '../../render/gl/legend';
import { PRECIP } from '../../render/gl/scales';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'niederschlag',
  category: 'wetter',
  title: 'Niederschlag',
  summary: 'Regen- und Schneefall als Rate, Vorhersage für 72 Stunden',
  icon: 'rain',
  color: '#4A78E6',
  form: 'field',
  exclusive: 'field',
  cadence: 'hourly',
  sources: [ICON_SOURCE],
  time: forecastTime,
  legend: () => scaleLegend(PRECIP),
  keywords: ['niederschlag', 'regen', 'schnee', 'schauer', 'precipitation', 'icon', 'dwd'],

  async mount(ctx) {
    const { fieldLayer } = await import('../../render/gl/field');
    return fieldLayer(ctx, {
      vars: ['precipitation'],
      scale: PRECIP,
      label: 'Niederschlag',
      format: (v) => formatQuantity('precip', v, { rate: true, digits: v < 1 ? 2 : 1 }),
    });
  },
});
