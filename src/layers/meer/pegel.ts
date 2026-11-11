// River gauges of the German federal waterways (PEGELONLINE REST, keyless, CORS open), coloured by state or by
// deviation from mean water.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatAge, formatDateTime, formatInt } from '../../core/format';
import { MINUTE } from '../../core/time';
import type { GaugeCollection, GaugeProps, GaugeState } from '../../data/parsers/pegel';
import { rampExpr, type Stops } from '../../data/parsers/ramps';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#3D9AD1';
const URL_ = 'https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations.json?timeseries=W&includeTimeseries=true&includeCurrentMeasurement=true&includeCharacteristicValues=true';
const STATE: Record<GaugeState, { color: string; label: string }> = {
  high: { color: '#E8384F', label: 'Hochwasser (über mittlerem Hochwasser)' },
  normal: { color: COLOR, label: 'Normal' },
  low: { color: '#F2A23C', label: 'Niedrigwasser (unter mittlerem Niedrigwasser)' },
  unknown: { color: '#8892A6', label: 'nicht eingestuft' },
};
/** cm relative to mean water: warm = low, blue to violet = high */
const DEV: Stops = [[-150, '#c77a2a'], [-75, '#e8b44f'], [0, '#dfe8ea'], [75, '#6bb4e8'], [150, '#2f6bd1'], [300, '#5b2bd6']];

export default defineLayer({
  id: 'pegel',
  category: 'meer',
  title: 'Flusspegel',
  summary: 'Wasserstände der Bundeswasserstraßen in Deutschland, Rhein, Elbe, Donau und mehr',
  icon: 'drop',
  color: COLOR,
  form: 'points',
  cadence: 'minutes',
  coverage: 'DE',
  sources: [{ name: 'PEGELONLINE, Wasserstraßen- und Schifffahrtsverwaltung des Bundes', url: 'https://www.pegelonline.wsv.de/', license: 'Datenlizenz Deutschland, Namensnennung 2.0' }],
  options: [{
    id: 'colorBy', label: 'Farbe nach', type: 'select', default: 'state',
    choices: [{ value: 'state', label: 'Hoch- und Niedrigwasser' }, { value: 'dev', label: 'Abweichung vom Mittelwasser' }],
  }],
  legend: (o) =>
    o.colorBy === 'dev'
      ? { type: 'scale', unit: 'cm gegenüber Mittelwasser', stops: DEV, ticks: [-150, -75, 0, 75, 150, 300], format: (v) => formatInt(v) }
      : { type: 'classes', items: (['high', 'normal', 'low', 'unknown'] as GaugeState[]).map((s) => ({ color: STATE[s].color, label: STATE[s].label, shape: 'dot' as const })) },
  keywords: ['pegel', 'wasserstand', 'hochwasser', 'niedrigwasser', 'rhein', 'elbe', 'fluss', 'wsv', 'pegelonline'],

  mount(ctx) {
    const gauges = ctx.resource<GaugeCollection>({ key: 'pegelonline:stations', url: URL_, parse: 'pegelStations', refresh: 10 * MINUTE, timeout: 40_000 });
    const dev = computed(() => ctx.options.value.colorBy === 'dev');
    const color = computed<ExpressionSpecification>(() =>
      dev.value
        ? (['case', ['has', 'dev'], rampExpr(['get', 'dev'], DEV), STATE.unknown.color] as unknown as ExpressionSpecification)
        : (['match', ['get', 'state'], 'high', STATE.high.color, 'low', STATE.low.color, 'normal', STATE.normal.color, STATE.unknown.color] as unknown as ExpressionSpecification),
    );

    return pointLayer(ctx, {
      data: gauges,
      radius: ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 6, 12, 9] as ExpressionSpecification,
      color,
      stroke: { color: '#ffffff', width: 1 },
      describe: (f: AnyFeature) => {
        const p = f.properties as GaugeProps;
        const st = STATE[p.state];
        const cm = (v: number) => `${formatInt(v)} cm`;
        return {
          title: p.name,
          subtitle: `${p.water}${p.km !== undefined ? `, Flusskilometer ${p.km}` : ''}`,
          time: p.time,
          color: st.color,
          icon: 'drop',
          facts: [
            { label: 'Wasserstand', value: cm(p.level), emphasis: true },
            ...(p.dev !== undefined ? [{ label: 'zum Mittelwasser', value: p.dev === 0 ? 'auf Mittelwasser' : `${cm(Math.abs(p.dev))} ${p.dev > 0 ? 'darüber' : 'darunter'}` }] : []),
            { label: 'Einstufung', value: st.label },
            ...(p.mw !== undefined ? [{ label: 'Mittelwasser (MW)', value: cm(p.mw) }] : []),
            ...(p.mnw !== undefined ? [{ label: 'Mittl. Niedrigwasser', value: cm(p.mnw) }] : []),
            ...(p.mhw !== undefined ? [{ label: 'Mittl. Hochwasser', value: cm(p.mhw) }] : []),
            { label: 'Messung', value: `${formatDateTime(p.time)} (${formatAge(p.time)})` },
            ...(p.agency ? [{ label: 'Betreiber', value: p.agency }] : []),
          ],
          links: [{ label: 'Pegel bei PEGELONLINE', url: `https://www.pegelonline.wsv.de/gast/stammdaten?pegelnr=${encodeURIComponent(p.id)}` }],
        };
      },
    });
  },
});
