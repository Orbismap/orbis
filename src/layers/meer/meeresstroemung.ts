// Ocean surface currents: Open-Meteo Marine on a 5° world lattice (about 1 600 ocean points, one set of calls shared
// with Seegang, cached 3 h in the browser) refined per region when zoomed in; drawn as a smooth speed field plus
// animated flow particles that stay on the water. The coarse model is for the big picture (gyres, Gulf Stream),
// not for coastal navigation.
import type { ColorScale } from '../../core/color';
import { formatNumber } from '../../core/format';
import { unitPrefs } from '../../core/units';
import { defineLayer } from '../define';

const COLOR = '#35C2E8';

/** km/h; calm water is a faint veil so that the particles carry the picture */
export const CURRENT_SCALE: ColorScale = {
  unit: 'km/h',
  ticks: [0, 2, 4, 6, 8],
  stops: [
    [0, 'rgba(30, 60, 160, 0)'], [0.3, 'rgba(40, 90, 200, 0.34)'], [1, 'rgba(40, 160, 220, 0.58)'], [2, 'rgba(60, 210, 180, 0.7)'],
    [3.5, 'rgba(190, 230, 90, 0.8)'], [4.5, '#f3b04a'], [6, '#e5603f'], [8, '#c0348a'],
  ],
};

/** kn when the user chose knots, otherwise km/h (Beaufort makes no sense for currents) */
const unit = () => (unitPrefs.value.wind === 'kn' ? { label: 'kn', k: 1 / 1.852 } : { label: 'km/h', k: 1 });

export default defineLayer({
  id: 'meeresstroemung',
  category: 'meer',
  title: 'Meeresströmung',
  summary: 'Strömung an der Meeresoberfläche weltweit, als fließende Partikel und Geschwindigkeitsfeld',
  icon: 'wave',
  color: COLOR,
  form: 'field',
  cadence: 'hourly',
  coverage: 'Meere',
  sources: [{ name: 'Open-Meteo Marine (MeteoFrance SMOC, Ocean Currents)', url: 'https://open-meteo.com/en/docs/marine-weather-api', license: 'CC BY 4.0' }],
  options: [
    { id: 'particles', label: 'Fließende Partikel', type: 'toggle', default: true },
    { id: 'field', label: 'Geschwindigkeit als Farbfläche', type: 'toggle', default: true },
  ],
  legend: () => {
    const u = unit();
    return {
      type: 'scale', unit: `Strömungsgeschwindigkeit in ${u.label}`,
      stops: CURRENT_SCALE.stops.map(([v, c]) => [v * u.k, c]), ticks: [0, 2, 4, 6, 8].map((v) => v * u.k), format: (v) => formatNumber(v, u.k < 1 ? 1 : 0),
    };
  },
  keywords: ['strömung', 'meeresströmung', 'golfstrom', 'ozean', 'meer', 'ocean current', 'gulf stream', 'kuroshio', 'partikel'],

  async mount(ctx) {
    const { seaFieldLayer } = await import('../../render/ocean/seafield');
    return seaFieldLayer(ctx, {
      note: 'Modellwerte, Raster 5° (näher heranzoomen verfeinert)',
      config: (o) => ({
        scalar: 'current',
        scale: CURRENT_SCALE,
        showField: o.field !== false,
        particles: o.particles === false ? null : { kind: 'current', speedPx: (s) => 60 * s ** 0.55 },
      }),
      probe: (v) => {
        const u = unit();
        return { label: 'Meeresströmung', value: `${formatNumber(v * u.k, 1)} ${u.label}` };
      },
    });
  },
});
