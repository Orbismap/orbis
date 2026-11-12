// Situation in Ukraine by oblast: incidents with explosive weapons against civilian infrastructure (Insecurity Insight)
// or hours of air-raid alarm; attacks on health care (WHO SSA, no location) are reported as a national figure.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { formatInt } from '../../core/format';
import { bucketUrl } from '../../data/endpoints';
import { oblastCollection, type OblastProps, type UkOblast } from '../../data/parsers/ukraine';
import { ZEUGEN_WARNUNG } from '../../data/parsers/zeitzeugen';
import { areaLayer } from '../../render/areas';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#EF6C4D';
const SECTOR: Record<string, string> = { 'Health Care': 'Gesundheit', Education: 'Bildung', 'Food Systems': 'Nahrungssysteme', 'Aid Operations': 'Hilfseinsätze', 'Water Systems': 'Wasser' };
const STOPS: Record<string, [number, string][]> = {
  incidents: [[0, '#3A2A28'], [20, '#7A3B2E'], [100, '#B94D33'], [400, '#E8663D'], [1000, '#FFB347']],
  air: [[0, '#2A2F3A'], [500, '#4B5C80'], [2000, '#7388C0'], [5000, '#A5B8F0'], [10000, '#E3EBFF']],
};
const top = (o: Record<string, number>, map: Record<string, string> = {}, n = 5) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${map[k] ?? k}: ${formatInt(v)}`).join(', ');

export default defineLayer({
  id: 'ukraine-lage',
  category: 'gesellschaft',
  title: 'Ukraine: Lage nach Oblast',
  summary: 'Vorfälle mit Explosivwaffen oder Luftalarm-Stunden je Oblast, dazu WHO-Zahlen zu Angriffen auf Gesundheitseinrichtungen',
  icon: 'warning',
  color: COLOR,
  form: 'areas',
  cadence: 'daily',
  coverage: 'Ukraine',
  sources: [
    { name: 'Insecurity Insight (Vorfälle mit Explosivwaffen, ohne Einzelorte), über HDX', url: 'https://data.humdata.org/dataset/f21002e5-4e00-4c95-bff1-ecd698bf9ff4', license: 'CC BY-SA', manifest: { bucket: 'data', key: 'ukraine-oblast.json' } },
    { name: 'Luftalarm-Datensatz (Vadimkin)', url: 'https://github.com/Vadimkin/ukrainian-air-raid-sirens-dataset', license: 'MIT' },
    { name: 'WHO Surveillance System for Attacks on Health Care (SSA)', url: 'https://extranet.who.int/ssa/', license: 'CC BY' },
    { name: 'Natural Earth, Verwaltungsgrenzen (Oblaste)', url: 'https://www.naturalearthdata.com/', license: 'Public Domain' },
  ],
  sensitive: ZEUGEN_WARNUNG,
  options: [{ id: 'metric', label: 'Maß', type: 'select', default: 'incidents', choices: [{ value: 'incidents', label: 'Vorfälle mit Explosivwaffen (seit 2020)' }, { value: 'air', label: 'Luftalarm-Stunden (seit 2022)' }] }],
  legend: (o) => ({ type: 'scale', unit: o.metric === 'air' ? 'Stunden Luftalarm' : 'Vorfälle', stops: STOPS[String(o.metric)] ?? STOPS.incidents!, ticks: (STOPS[String(o.metric)] ?? STOPS.incidents!).map((s) => s[0]).slice(1) }),
  keywords: ['ukraine', 'luftalarm', 'oblast', 'who', 'gesundheit', 'krankenhaus', 'angriffe', 'zeitzeugen'],

  mount(ctx) {
    const table = ctx.resource<UkOblast>({ key: 'data:ukraine-oblast', url: bucketUrl('data', 'ukraine-oblast.json'), timeout: 30_000 });
    const geo = ctx.resource<FeatureCollection>({ key: 'static:ukraine-oblasts', url: `${import.meta.env.BASE_URL}data/ukraine-oblasts.json`, timeout: 30_000 });
    const metric = computed(() => (ctx.options.value.metric === 'air' ? 'air' : 'incidents'));
    const data = computed(() => (table.data.value && geo.data.value ? oblastCollection(geo.data.value, table.data.value, metric.value) : undefined));
    const stops = computed(() => STOPS[metric.value]!);
    const fill = computed(() => ['interpolate', ['linear'], ['get', 'value'], ...stops.value.flat()] as unknown as ExpressionSpecification);
    // WHO has no location: the national figure of the last full months goes into the status line and every card
    const who = computed(() => {
      const w = table.data.value?.who;
      if (!w) return undefined;
      const months = Object.keys(w).sort();
      const total = months.reduce((s, m) => ({ a: s.a + w[m]!.attacks, k: s.k + w[m]!.killed, i: s.i + w[m]!.injured }), { a: 0, k: 0, i: 0 });
      return { total, from: months[0]!, to: months[months.length - 1]! };
    });
    return areaLayer({ ...ctx, status: (s) => ctx.status(s.state === 'ready' && who.peek() ? { ...s, note: `WHO: ${formatInt(who.peek()!.total.a)} Angriffe auf Gesundheitseinrichtungen ${who.peek()!.from} bis ${who.peek()!.to}` } : s) }, {
      data: data as never,
      resources: [table, geo],
      fill: fill as never,
      fillOpacity: 0.65,
      outline: { color: 'rgba(20,14,12,0.9)', width: 1 },
      describe: (f: AnyFeature) => {
        const p = f.properties as OblastProps;
        const r = table.data.value?.regions[p.id];
        const w = who.peek();
        return {
          title: p.name,
          subtitle: 'Oblast',
          color: COLOR,
          icon: 'warning',
          facts: [
            { label: 'Vorfälle mit Explosivwaffen (Insecurity Insight)', value: formatInt(p.incidents), emphasis: metric.value === 'incidents' },
            { label: 'Luftalarm-Stunden seit 2022', value: formatInt(p.airHours), emphasis: metric.value === 'air' },
            ...(p.last ? [{ label: 'Letzter Vorfall', value: p.last.split('-').reverse().join('.') }] : []),
            ...(r ? [{ label: 'Betroffene Sektoren', value: top(r.sector, SECTOR) || 'keine' }, { label: 'Waffenarten', value: top(r.weapon) || 'keine' }] : []),
            ...(w ? [{ label: 'Landesweit (WHO SSA, ohne Ortsangabe)', value: `${formatInt(w.total.a)} Angriffe auf Gesundheitseinrichtungen, ${formatInt(w.total.k)} Getötete, ${formatInt(w.total.i)} Verletzte (${w.from} bis ${w.to})` }] : []),
          ],
          text: 'Die Orte der Einzelvorfälle sind im Datensatz entfernt, deshalb zeigt die Ebene nur Regionen.',
          links: [{ label: 'Insecurity Insight bei HDX (CC BY-SA)', url: 'https://data.humdata.org/dataset/f21002e5-4e00-4c95-bff1-ecd698bf9ff4' }, { label: 'WHO SSA (CC BY)', url: 'https://extranet.who.int/ssa/' }, { label: 'Luftalarm-Datensatz (MIT)', url: 'https://github.com/Vadimkin/ukrainian-air-raid-sirens-dataset' }],
        };
      },
    });
  },
});
