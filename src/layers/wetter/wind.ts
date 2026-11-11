// Wind 10 m (ICON): coloured speed field plus flowing particles.
import { computed, effect } from '@preact/signals';
import { formatQuantity } from '../../core/units';
import { ICON_SOURCE, forecastTime } from '../../render/gl/latest';
import { scaleLegend } from '../../render/gl/legend';
import { WIND } from '../../render/gl/scales';
import type { LayerHandle } from '../types';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'wind',
  category: 'wetter',
  title: 'Wind',
  summary: 'Windgeschwindigkeit in 10 m Höhe mit strömenden Partikeln',
  icon: 'wind',
  color: '#6FD19A',
  form: 'field',
  exclusive: 'field',
  cadence: 'hourly',
  sources: [ICON_SOURCE],
  time: forecastTime,
  options: [{ id: 'stroemung', label: 'Strömung', type: 'toggle', default: true }],
  legend: () => scaleLegend(WIND),
  keywords: ['wind', 'sturm', 'strömung', 'partikel', 'windstärke', 'icon', 'dwd'],

  async mount(ctx) {
    const [{ fieldLayer }, { particleLayer }] = await Promise.all([import('../../render/gl/field'), import('../../render/gl/particles')]);
    const field = fieldLayer(ctx, {
      vars: ['u', 'v'],
      mode: 'magnitude',
      scale: WIND,
      label: 'Wind',
      format: (v) => formatQuantity('wind', v),
    });
    let particles: LayerHandle | undefined;
    const on = computed(() => ctx.options.value.stroemung !== false);
    const stop = effect(() => {
      if (on.value && !particles) particles = particleLayer(ctx);
      else if (!on.value && particles) {
        particles.destroy();
        particles = undefined;
      }
    });
    return {
      probe: (at) => field.probe?.(at) ?? null,
      destroy() {
        stop();
        particles?.destroy();
        field.destroy();
      },
    };
  },
});
