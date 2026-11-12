// Protests in the USA, Crowd Counting Consortium (Harvard Kennedy School / UConn, CC0). Shows the events of a window
// that ends at the selected time (or at the last day of the data while live). The 22 MB file is parsed in the worker.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatDate, formatInt } from '../../core/format';
import { DAY } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import type { ProtestCollection, ProtestProps } from '../../data/parsers/ccc';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#8F7BFF';
const FIRST = Date.UTC(2025, 0, 1);
const WINDOWS = [{ value: '7', label: '7 Tage', days: 7 }, { value: '30', label: '30 Tage', days: 30 }, { value: '90', label: '90 Tage', days: 90 }, { value: '365', label: '1 Jahr', days: 365 }];
const DATASET = 'https://doi.org/10.7910/DVN/RI9JFU';
const link = (u: string) => (/^https?:\/\//.test(u) ? u : /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u) ? `https://${u}` : '');

export default defineLayer({
  id: 'us-proteste',
  category: 'gesellschaft',
  title: 'Proteste USA',
  summary: 'Demonstrationen, Märsche und Kundgebungen in den USA, Größe nach geschätzter Teilnehmerzahl',
  icon: 'people',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  coverage: 'USA',
  sources: [{ name: 'Crowd Counting Consortium (Harvard Kennedy School, University of Connecticut), Phase 3', url: DATASET, license: 'CC0 1.0', manifest: { bucket: 'data', key: 'ccc-us.json' } }],
  time: { mode: 'window', range: () => ({ start: FIRST - Date.now(), end: 0, step: DAY }) },
  options: [{ id: 'window', label: 'Zeitraum bis zum gewählten Tag', type: 'select', default: '30', choices: WINDOWS.map(({ value, label }) => ({ value, label })) }],
  legend: { type: 'size', unit: 'geschätzte Teilnehmer', color: COLOR, items: [{ size: 2.4, label: 'unbekannt/klein' }, { size: 7, label: '10 000' }, { size: 14, label: '100 000' }] },
  keywords: ['protest', 'demo', 'demonstration', 'ccc', 'crowd counting', 'usa', 'kundgebung', 'march', 'rally', 'streik'],

  mount(ctx) {
    const raw = ctx.resource<ProtestCollection>({ key: 'data:ccc-us', url: bucketUrl('data', 'ccc-us.json'), parse: 'cccEvents', timeout: 120_000 });
    const visible = computed<ProtestCollection | undefined>(() => {
      const d = raw.data.value;
      if (!d) return undefined;
      const days = WINDOWS.find((w) => w.value === String(ctx.options.value.window ?? '30'))?.days ?? 30;
      // live: the data ends at its last day, so the newest window is shown instead of an empty map
      const end = Math.min(ctx.time.value, (d.lastDay ?? 0) + DAY / 2);
      const start = end - days * DAY;
      return { type: 'FeatureCollection', features: d.features.filter((f) => f.properties.t > start && f.properties.t <= end) };
    });
    const note = computed(() => { const d = raw.data.value; return d?.lastDay ? `Daten bis ${new Date(d.lastDay).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}` : undefined; });
    return pointLayer({ ...ctx, status: (s) => ctx.status(s.state === 'ready' || s.state === 'empty' ? { ...s, note: note.peek() ?? s.note } : s) }, {
      data: visible,
      resources: [raw],
      cluster: { radius: 40, maxZoom: 7 },
      radius: ['interpolate', ['linear'], ['zoom'], 2, ['max', 2, ['min', 10, ['*', 0.04, ['sqrt', ['get', 's']]]]], 10, ['max', 3.5, ['min', 18, ['*', 0.1, ['sqrt', ['get', 's']]]]]] as ExpressionSpecification,
      color: ['case', ['>', ['get', 's'], 0], COLOR, '#7A7FA8'] as ExpressionSpecification,
      stroke: { color: 'rgba(20, 12, 50, 0.9)', width: 1 },
      sortKey: ['get', 's'] as ExpressionSpecification,
      describe: (f: AnyFeature) => {
        const p = f.properties as ProtestProps;
        const size = p.slo || p.shi ? `${p.slo ? formatInt(p.slo) : '?'} bis ${formatInt(p.shi)} (Spanne)` : p.s ? `${formatInt(p.s)} (Schätzung)` : '';
        const src = [p.so, p.so2].filter(Boolean);
        return {
          title: p.title || `Protest in ${p.city || p.st || 'den USA'}`,
          subtitle: [p.city, p.st].filter(Boolean).join(', ') || 'USA',
          time: p.t,
          color: COLOR,
          icon: 'people',
          facts: [
            { label: 'Datum', value: formatDate(p.t), emphasis: true },
            ...(p.ty ? [{ label: 'Art', value: p.ty }] : []),
            { label: 'Größe', value: size ? `${size}${p.sb ? `, ${p.sb}` : ''}` : p.sb || 'ohne Schätzung' },
            ...(p.is ? [{ label: 'Themen', value: p.is.replace(/;/g, ', ') }] : []),
            ...(p.ar >= 0 ? [{ label: 'Festnahmen', value: p.ar === 0 ? 'keine' : formatInt(p.ar) }] : []),
            ...(p.pl ? [{ label: 'Polizeimaßnahmen', value: p.pl }] : []),
            ...(p.dmg ? [{ label: 'Sachschaden', value: p.dmg }] : []),
            ...(p.pi ? [{ label: 'Verletzte (Teilnehmende)', value: p.pi }] : []),
            ...(p.poi ? [{ label: 'Verletzte (Polizei)', value: p.poi }] : []),
            ...(p.pd ? [{ label: 'Todesfälle (Teilnehmende)', value: p.pd }] : []),
            ...(p.pod ? [{ label: 'Todesfälle (Polizei)', value: p.pod }] : []),
            ...(src.length ? [{ label: 'Quellen', value: src.join(', ') }] : []),
          ],
          text: p.cl ? `Anliegen: ${p.cl}` : undefined,
          links: [...src.map((s) => ({ label: s, url: link(s) })).filter((l) => l.url), { label: 'Datensatz (CC0)', url: DATASET }],
        };
      },
    });
  },
});
