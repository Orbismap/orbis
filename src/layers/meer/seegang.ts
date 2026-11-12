// Waves as a smooth global field instead of 240 coarse points: Open-Meteo Marine (MFWAM/EWAM) on the shared 5° lattice
// (one set of calls with Meeresströmung, cached 3 h), interpolated and clipped to the ocean, refined per region when
// zoomed in. Particles drift in the direction the waves travel; swell is an option.
import { formatNumber } from '../../core/format';
import { WAVE_STOPS } from '../../data/parsers/ramps';
import type { ColorScale } from '../../core/color';
import { defineLayer } from '../define';

const COLOR = '#66BB6A';

/** the legend ramp, with a soft start so that calm sea stays see-through */
const WAVE_SCALE: ColorScale = {
  unit: 'm',
  ticks: [0, 2, 4, 6, 8, 10],
  stops: [
    [0, 'rgba(79, 195, 247, 0)'], [0.4, 'rgba(79, 195, 247, 0.3)'], [1, 'rgba(38, 198, 218, 0.55)'], [2, 'rgba(102, 187, 106, 0.68)'],
    [3.5, 'rgba(255, 238, 88, 0.78)'], [5, 'rgba(255, 167, 38, 0.85)'], [7, 'rgba(239, 83, 80, 0.9)'], [10, '#ab47bc'],
  ],
};

export default defineLayer({
  id: 'seegang',
  category: 'meer',
  title: 'Seegang',
  summary: 'Wellenhöhe der Weltmeere als Farbfläche, Partikel zeigen die Laufrichtung der Wellen, Modellwerte',
  icon: 'wave',
  color: COLOR,
  form: 'field',
  cadence: 'hourly',
  coverage: 'Meere',
  sources: [{ name: 'Open-Meteo Marine (MeteoFrance MFWAM, DWD EWAM)', url: 'https://open-meteo.com/en/docs/marine-weather-api', license: 'CC BY 4.0' }],
  options: [
    { id: 'quantity', label: 'Anzeige', type: 'select', default: 'wave', choices: [{ value: 'wave', label: 'Wellen insgesamt' }, { value: 'swell', label: 'Dünung' }] },
    { id: 'particles', label: 'Partikel in Wellenrichtung', type: 'toggle', default: true },
  ],
  legend: (o) => ({
    type: 'scale', unit: o.quantity === 'swell' ? 'Dünungshöhe in m' : 'Wellenhöhe in m', stops: WAVE_STOPS, ticks: [0, 2, 4, 6, 8, 10], format: (v) => formatNumber(v, 0),
  }),
  keywords: ['wellen', 'seegang', 'wellenhöhe', 'sturm', 'ozean', 'dünung', 'swell', 'marine', 'wellenrichtung'],

  async mount(ctx) {
    const { seaFieldLayer } = await import('../../render/ocean/seafield');
    return seaFieldLayer(ctx, {
      note: 'Modellwerte, Raster 5° (näher heranzoomen verfeinert)',
      config: (o) => {
        const swell = o.quantity === 'swell';
        return {
          scalar: swell ? 'swell' : 'wave',
          scale: WAVE_SCALE,
          showField: true,
          particles: o.particles === false ? null : { kind: swell ? 'swell' : 'wave' },
        };
      },
      probe: (v, cfg) => ({ label: cfg.scalar === 'swell' ? 'Dünung' : 'Wellenhöhe', value: `${formatNumber(v, 1)} m` }),
    });
  },
});
