// Displacement events in Gaza (IDMC Internal Displacement Updates): points sized by the number of people, time aware.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatDate, formatInt } from '../../core/format';
import { DAY } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import type { DisplaceCollection, DisplaceProps } from '../../data/parsers/gaza';
import { ZEUGEN_WARNUNG } from '../../data/parsers/zeitzeugen';
import { pointLayer } from '../../render/points';
import { markEventTimes, type AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#4FB3E8';
const FIRST = Date.UTC(2025, 0, 1);

export default defineLayer({
  id: 'gaza-vertreibung',
  category: 'gesellschaft',
  title: 'Gaza: Vertreibung',
  summary: 'Gemeldete Vertreibungsereignisse in Gaza, Größe nach Zahl der betroffenen Menschen',
  icon: 'warning',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  coverage: 'Gazastreifen',
  sources: [{ name: 'IDMC Internal Displacement Updates, State of Palestine, über HDX', url: 'https://data.humdata.org/dataset/idmc-internal-displacement-updates', license: 'CC BY-IGO', manifest: { bucket: 'data', key: 'gaza-displacement.json' } }],
  sensitive: ZEUGEN_WARNUNG,
  time: { mode: 'window', range: () => ({ start: FIRST - Date.now(), end: 0, step: DAY }) },
  legend: { type: 'size', unit: 'betroffene Menschen', color: COLOR, items: [{ size: 3, label: '10' }, { size: 7, label: '1 000' }, { size: 14, label: '30 000' }] },
  keywords: ['gaza', 'vertreibung', 'idmc', 'flucht', 'vertriebene', 'zeitzeugen'],

  mount(ctx) {
    const raw = ctx.resource<DisplaceCollection>({ key: 'data:gaza-displacement', url: bucketUrl('data', 'gaza-displacement.json'), parse: 'gazaDisplacement', timeout: 30_000 });
    const visible = computed<DisplaceCollection | undefined>(() => {
      const d = raw.data.value;
      if (!d) return undefined;
      const t = ctx.time.value;
      return { type: 'FeatureCollection', features: d.features.filter((f) => f.properties.t <= t + DAY / 2) };
    });
    // Striche in der Zeitleiste: wann die Ereignisse stattfanden
    markEventTimes(ctx, () => raw.data.value?.features.map((x) => x.properties.t));
    return pointLayer(ctx, {
      data: visible,
      resources: [raw],
      cluster: { radius: 30, maxZoom: 10 },
      radius: ['interpolate', ['linear'], ['zoom'], 7, ['max', 3, ['min', 12, ['*', 0.08, ['sqrt', ['get', 'people']]]]], 13, ['max', 5, ['min', 24, ['*', 0.16, ['sqrt', ['get', 'people']]]]]] as ExpressionSpecification,
      color: COLOR,
      stroke: { color: 'rgba(5,20,35,0.9)', width: 1 },
      sortKey: ['-', 0, ['get', 'people']] as ExpressionSpecification,
      describe: (f: AnyFeature) => {
        const p = f.properties as DisplaceProps;
        return {
          title: p.place.split(',')[0] || 'Vertreibungsereignis',
          subtitle: 'IDMC Internal Displacement Update',
          time: p.t,
          color: COLOR,
          icon: 'warning',
          facts: [
            { label: 'Datum', value: formatDate(p.t), emphasis: true },
            { label: 'Betroffene', value: formatInt(p.people) },
            { label: 'Ort', value: p.place },
            ...(p.kind ? [{ label: 'Ursache', value: p.kind }] : []),
            ...(p.type ? [{ label: 'Art', value: p.type }] : []),
            ...(p.source ? [{ label: 'Meldende Stelle', value: p.source }] : []),
          ],
          text: p.text || undefined,
          links: [{ label: 'IDMC Datensatz (CC BY-IGO)', url: 'https://data.humdata.org/dataset/idmc-internal-displacement-updates' }],
        };
      },
    });
  },
});
