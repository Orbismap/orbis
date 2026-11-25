// Registered assemblies and demonstrations in DE/AT/CH (demonstrations.org, mirrors the authorities' lists).
// Time aware: shows what is running at the selected time plus the upcoming days (option).
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatDateTime, formatInt } from '../../core/format';
import { DAY, HOUR, MINUTE } from '../../core/time';
import type { DemoData, DemoCollection, DemoProps } from '../../data/parsers/demos';
import { pointLayer } from '../../render/points';
import { markEventTimes, type AnyFeature } from '../../render/common';
import { defineLayer } from '../define';
import { bucketUrl } from '../../data/endpoints';

const COLOR = '#FF8A3D';
const NOW = '#FFC233';
const LATER = '#C77A45';

const AHEAD: { value: string; label: string; days: number }[] = [
  { value: '1', label: '1 Tag', days: 1 }, { value: '3', label: '3 Tage', days: 3 }, { value: '7', label: '7 Tage', days: 7 },
  { value: '14', label: '14 Tage', days: 14 }, { value: '30', label: '30 Tage', days: 30 }, { value: 'all', label: 'Alle', days: Infinity },
];

export default defineLayer({
  id: 'demos',
  category: 'gesellschaft',
  title: 'Demonstrationen',
  summary: 'Angemeldete Versammlungen und Demonstrationen in Deutschland, Österreich und der Schweiz',
  icon: 'people',
  color: COLOR,
  form: 'points',
  cadence: 'minutes',
  coverage: 'DE/AT/CH',
  sources: [{
    name: 'demonstrations.org (Demos Berlin e.V.), Versammlungslisten der Behörden', url: 'https://demonstrations.org/',
    license: 'CC BY-SA 4.0', manifest: { bucket: 'live', key: 'demos.json' },
  }],
  time: { mode: 'window', range: () => ({ start: -DAY, end: 30 * DAY, step: HOUR }) },
  options: [{ id: 'ahead', label: 'Vorschau', type: 'select', default: '7', choices: AHEAD.map(({ value, label }) => ({ value, label })) }],
  legend: { type: 'classes', items: [{ color: NOW, label: 'Läuft gerade' }, { color: COLOR, label: 'Beginnt in den nächsten 24 Stunden' }, { color: LATER, label: 'Später' }] },
  keywords: ['demo', 'demonstration', 'kundgebung', 'versammlung', 'protest', 'streik', 'mahnwache', 'aufzug'],

  mount(ctx) {
    const raw = ctx.resource<DemoData>({ key: 'live:demos', url: bucketUrl('live', 'demos.json'), parse: 'demoEvents', refresh: 15 * MINUTE, timeout: 40_000 });

    const visible = computed<DemoCollection | undefined>(() => {
      const d = raw.data.value;
      if (!d) return undefined;
      const t = ctx.time.value;
      const days = AHEAD.find((a) => a.value === String(ctx.options.value.ahead ?? '7'))?.days ?? 7;
      const until = t + days * DAY;
      return { type: 'FeatureCollection', features: d.features.features.filter((f) => f.properties.end >= t && f.properties.start <= until) };
    });
    // Zeitleiste: Beginn aller Versammlungen, unabhängig vom gewählten Zeitpunkt
    markEventTimes(ctx, () => raw.data.value?.features.features.map((f) => f.properties.start));
    const color = computed(() => {
      const t = ctx.time.value;
      return ['case',
        ['<=', ['get', 'start'], t], NOW,
        ['<=', ['get', 'start'], t + DAY], COLOR,
        LATER,
      ] as unknown as ExpressionSpecification;
    });

    return pointLayer(ctx, {
      data: visible,
      resources: [raw],
      cluster: { radius: 38, maxZoom: 8 },
      radius: ['interpolate', ['linear'], ['zoom'], 1, 3.5, 6, 5, 11, 7.5] as ExpressionSpecification,
      color,
      stroke: { color: 'rgba(40, 18, 4, 0.9)', width: 1 },
      describe: (f: AnyFeature) => {
        const p = f.properties as DemoProps;
        const lines = p.points ? p.points.split('\n') : [];
        return {
          title: p.name,
          subtitle: [p.city, p.role].filter(Boolean).join(' · ') || 'Versammlung',
          time: p.start,
          color: COLOR,
          icon: 'people',
          facts: [
            { label: 'Beginn', value: formatDateTime(p.start), emphasis: true },
            { label: 'Ende', value: formatDateTime(p.end) },
            ...(p.place || p.city ? [{ label: 'Treffpunkt', value: [p.place, p.city].filter(Boolean).join(', ') }] : []),
            ...(p.org ? [{ label: 'Veranstalter', value: p.org }] : []),
            ...(p.topics ? [{ label: 'Themen', value: p.topics }] : []),
            ...(p.est ? [{ label: 'Erwartet', value: /^\d+$/.test(p.est) ? `${formatInt(Number(p.est))} Personen` : p.est }] : []),
            { label: 'Art', value: p.march ? 'Marsch' : 'Versammlung' },
            ...(lines.length > 1 ? [{ label: 'Treffpunkte', value: lines.join(' → ') }] : []),
            ...(p.country ? [{ label: 'Land', value: p.country }] : []),
          ],
          text: p.text && p.text !== p.name ? p.text : undefined,
          links: [
            ...(p.url ? [{ label: 'Eintrag auf demonstrations.org', url: p.url }] : []),
            ...(/^https?:\/\//.test(p.src) ? [{ label: 'Amtliche Meldung', url: p.src }] : []),
          ],
        };
      },
      feed: (features) =>
        features
          .filter((f) => (f.properties as DemoProps).start !== undefined) // clusters carry no event
          .sort((a, b) => (a.properties as DemoProps).start - (b.properties as DemoProps).start)
          .slice(0, 200)
          .map((f, i) => {
            const p = f.properties as DemoProps;
            const c = (f.geometry as { coordinates: number[] }).coordinates;
            return { id: `${p.id}-${i}`, title: p.name, subtitle: [p.city, formatDateTime(p.start)].filter(Boolean).join(' · '), time: p.start, color: COLOR, location: [c[0]!, c[1]!] as [number, number] };
          }),
    });
  },
});
