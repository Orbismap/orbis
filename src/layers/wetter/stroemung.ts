// Wind particles only, to lay over satellite imagery, radar or other fields.
import { ICON_SOURCE, forecastTime } from '../../render/gl/latest';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'stroemung',
  category: 'wetter',
  title: 'Windströmung',
  summary: 'Strömende Partikel entlang des Windes, über jeder anderen Ebene',
  icon: 'wind',
  color: '#C4E2FF',
  form: 'tracks',
  cadence: 'hourly',
  sources: [ICON_SOURCE],
  time: forecastTime,
  keywords: ['strömung', 'wind', 'partikel', 'windrichtung', 'icon', 'dwd'],

  async mount(ctx) {
    const { particleLayer } = await import('../../render/gl/particles');
    const handle = particleLayer(ctx, { alpha: 0.95 });
    return handle;
  },
});
