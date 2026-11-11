// Convective available potential energy (ICON): where thunderstorms can build.
import { formatNumber } from '../../core/format';
import { ICON_SOURCE, forecastTime } from '../../render/gl/latest';
import { scaleLegend } from '../../render/gl/legend';
import { CAPE } from '../../render/gl/scales';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'cape',
  category: 'wetter',
  title: 'Gewitterenergie (CAPE)',
  summary: 'Konvektive Energie der Luft: wo Gewitter entstehen können',
  icon: 'bolt',
  color: '#EE7B36',
  form: 'field',
  exclusive: 'field',
  cadence: 'hourly',
  sources: [ICON_SOURCE],
  time: forecastTime,
  legend: () => scaleLegend(CAPE),
  keywords: ['cape', 'gewitter', 'konvektion', 'unwetter', 'thunderstorm', 'icon', 'dwd'],

  async mount(ctx) {
    const { fieldLayer } = await import('../../render/gl/field');
    return fieldLayer(ctx, {
      vars: ['cape'],
      scale: CAPE,
      label: 'Gewitterenergie',
      format: (v) => `${formatNumber(v, 0)} J/kg`,
    });
  },
});
