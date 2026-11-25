// Smithsonian GVP: Holocene volcanoes (triangles) plus their eruption history (11 000 events).
// One layer, two views selectable in the inspector: eruptions over time (default, on the timeline) or the volcanoes as they are today.
import { computed, effect } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatInt, formatWithUnit } from '../../core/format';
import { DAY, HOUR } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import type { EruptionCollection, EruptionProps } from '../../data/parsers/eruptions';
import type { VolcanoCollection, VolcanoProps, VolcanoState } from '../../data/parsers/gvp';
import { markEventTimes, type AnyFeature } from '../../render/common';
import { pointLayer } from '../../render/points';
import type { LayerHandle } from '../types';
import { defineLayer } from '../define';

const COLORS: Record<VolcanoState, string> = { active: '#FF4B2B', historic: '#FFA23A', dormant: '#8C939E' };
const LAST_YEAR = new Date().getFullYear() - 1;
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const ERUPTIONS_URL = `${env.BASE_URL ?? './'}data/gvp-eruptions.json`;

/** Beginn eines Ausbruchs in ms (Jahre vor 100 und negative Jahre inklusive; unbekannter Monat = Januar). */
const eruptionMs = (year: number, month: number) => {
  const d = new Date(0);
  d.setUTCFullYear(year, Math.max(0, month - 1), 1);
  return d.getTime();
};
const FIRST_ERUPTION = eruptionMs(-55000, 1);
const year = (y: number) => (y < 0 ? `${-y} v. Chr.` : String(y));
const sizeBy = (a: number, h: number, d: number): ExpressionSpecification => ['match', ['get', 'rank'], 2, a, 1, h, d] as ExpressionSpecification;

const EPOCHS = [
  { min: 1900, label: 'Seit 1900', color: '#FF4B2B', dim: 'rgba(255, 75, 43, 0.3)' },
  { min: 1, label: 'Seit der Zeitenwende', color: '#FFA23A', dim: 'rgba(255, 162, 58, 0.3)' },
  { min: -9700, label: 'Holozän (ab 9 700 v. Chr.)', color: '#E0C15A', dim: 'rgba(224, 193, 90, 0.3)' },
  { min: -Infinity, label: 'Älter (bis 55 500 v. Chr.)', color: '#8C939E', dim: 'rgba(140, 147, 158, 0.3)' },
] as const;
const FILTERS = [
  { value: 'all', label: 'Alles', min: -Infinity },
  { value: 'holo', label: 'Holozän', min: -9700 },
  { value: 'ce', label: 'Zeitenwende', min: 1 },
  { value: '1500', label: 'Seit 1500', min: 1500 },
  { value: '1900', label: 'Seit 1900', min: 1900 },
];
/** Von- und Bis-Jahr der Ausbrüche nach der Option „Zeitraum“. */
function eruptionYears(o: Record<string, unknown>): { lo: number; hi: number } {
  const min = FILTERS.find((f) => f.value === String(o.epoch ?? '1900'))?.min ?? -Infinity;
  return { lo: Number.isFinite(min) ? min : -Infinity, hi: Infinity };
}
const VEI = ['nicht angegeben', 'schwach', 'mäßig', 'stark', 'sehr stark', 'gewaltig', 'katastrophal', 'Superausbruch'];
const yearLabel = (y: number) => (y < 0 ? `${formatInt(-y)} v. Chr.` : formatInt(y));
const whenLabel = (p: EruptionProps) => {
  const y = yearLabel(p.year);
  if (!p.month || p.year < 1500) return y;
  return `${p.day ? `${p.day}.` : ''}${p.month}. ${y}`;
};
const epochColor = (key: 'color' | 'dim'): ExpressionSpecification => {
  const pairs = EPOCHS.slice(0, -1).flatMap((e) => [['>=', ['get', 'year'], e.min], e[key]]);
  return ['case', ...pairs, EPOCHS[EPOCHS.length - 1]![key]] as unknown as ExpressionSpecification;
};
const eruptionColor = ['case', ['==', ['get', 'conf'], 0], epochColor('dim'), epochColor('color')] as unknown as ExpressionSpecification;
const sizeByVei = (a: number, b: number, c: number, d: number): ExpressionSpecification =>
  ['interpolate', ['linear'], ['get', 'vei'], 0, a, 2, b, 4, c, 7, d] as ExpressionSpecification;

export default defineLayer({
  id: 'vulkane',
  category: 'gefahren',
  title: 'Vulkane',
  summary: 'Vulkane des Holozäns und ihre Ausbrüche; Ansicht wählt zwischen aktiven Vulkanen und der Eruptionsgeschichte',
  icon: 'volcano',
  color: COLORS.active,
  form: 'points',
  cadence: 'daily',
  // Zeitleiste nur in der Ansicht „Ausbrüche“: von den ältesten Ausbrüchen bis heute, in Zehnjahresschritten
  time: {
    mode: 'window',
    enabled: (o) => o.view !== 'vulkane',
    // Der Zeitraum der Ausbrüche (Option „Zeitraum“) bestimmt auch die Zeitleiste
    range: (o) => {
      const { lo, hi } = eruptionYears(o);
      const now = Date.now();
      return { start: (Number.isFinite(lo) ? eruptionMs(lo, 1) : FIRST_ERUPTION) - now, end: hi >= new Date().getFullYear() ? 0 : eruptionMs(hi, 12) - now, step: 10 * 365.25 * DAY };
    },
  },
  coverage: 'Welt',
  sources: [{ name: 'Smithsonian Global Volcanism Program', url: 'https://volcano.si.edu/', license: 'Smithsonian, Quellenangabe', manifest: { bucket: 'data', key: 'volcanoes.json' } }],
  options: [
    { id: 'view', label: 'Ansicht', type: 'select', choices: [{ value: 'ausbrueche', label: 'Ausbrüche' }, { value: 'vulkane', label: 'Vulkane' }], default: 'ausbrueche' },
    // Ausbrüche: der Zeitraum bestimmt auch die Zeitleiste
    { id: 'epoch', label: 'Zeitraum', type: 'select', choices: FILTERS.map((f) => ({ value: f.value, label: f.label })), default: '1900', when: (o) => o.view !== 'vulkane' },
    // Vulkane: nur die mit Ausbruch seit dem letzten Jahr
    { id: 'onlyActive', label: 'Nur aktive', type: 'toggle', default: false, when: (o) => o.view === 'vulkane' },
  ],
  legend: (o) =>
    o.view !== 'vulkane'
      ? { type: 'classes', items: EPOCHS.map((e) => ({ color: e.color, label: e.label })) }
      : {
          type: 'classes',
          items: [
            { color: COLORS.active, label: `Ausbruch seit ${LAST_YEAR}` },
            { color: COLORS.historic, label: 'Ausbruch seit 1900' },
            { color: COLORS.dormant, label: 'Älter oder ruhend' },
          ],
        },
  keywords: ['vulkan', 'ausbruch', 'eruption', 'volcano', 'gvp', 'lava', 'smithsonian', 'vei', 'explosivität', 'holozän'],

  mount(ctx) {
    const resVolcano = ctx.resource<VolcanoCollection>({ key: 'data:volcanoes', url: bucketUrl('data', 'volcanoes.json'), parse: 'gvpVolcanoes', refresh: 6 * HOUR, timeout: 40_000 });
    const resEruption = ctx.resource<EruptionCollection>({ key: 'data:gvp-eruptions', url: ERUPTIONS_URL, parse: 'gvpEruptions', timeout: 40_000 });

    const visibleVolcano = computed<VolcanoCollection | undefined>(() => {
      const d = resVolcano.data.value;
      if (!d) return undefined;
      return ctx.options.value.onlyActive ? { type: 'FeatureCollection', features: d.features.filter((f) => f.properties.state === 'active') } : d;
    });

    const visibleEruption = computed<EruptionCollection | undefined>(() => {
      const d = resEruption.data.value;
      if (!d) return undefined;
      const { lo, hi } = eruptionYears(ctx.options.value);
      // Fenster: Ausbrüche bis zum gewählten Zeitpunkt (live: alle)
      const upTo = new Date(ctx.time.value).getUTCFullYear();
      return { type: 'FeatureCollection', features: d.features.filter((f) => f.properties.year >= lo && f.properties.year <= hi && f.properties.year <= upTo) };
    });

    const view = computed(() => String(ctx.options.value.view ?? 'ausbrueche'));

    // Zeitleiste (Ansicht „Ausbrüche“): alle Ausbrüche in den Farben der Legende, unabhängig vom gewählten Zeitpunkt
    markEventTimes(ctx, () => {
      const d = view.value !== 'vulkane' ? resEruption.data.value : undefined;
      if (!d) return undefined;
      return { times: d.features.map((f) => eruptionMs(f.properties.year, f.properties.month)), colors: d.features.map((f) => EPOCHS.find((e) => f.properties.year >= e.min)!.color) };
    });

    let active: LayerHandle | null = null;
    let activeView: string | null = null;
    const rebuild = () => {
      const v = view.value;
      if (v === activeView) return;
      if (active) { active.destroy(); active = null; }
      activeView = v;
      if (v !== 'vulkane') {
        active = pointLayer(ctx, {
          data: visibleEruption,
          resources: [resEruption],
          idKey: 'id',
          radius: ['interpolate', ['linear'], ['zoom'], 1, sizeByVei(1.6, 2.4, 3.6, 5.5), 8, sizeByVei(3, 4.5, 7, 10)] as ExpressionSpecification,
          color: eruptionColor,
          stroke: { color: 'rgba(10, 15, 24, 0.7)', width: 0.6 },
          sortKey: ['get', 'vei'] as ExpressionSpecification,
          describe: (f: AnyFeature) => {
            const p = f.properties as EruptionProps;
            const epoch = EPOCHS.find((e) => p.year >= e.min)!;
            return {
              title: p.name,
              subtitle: `${whenLabel(p)}${p.vei ? ` · VEI ${p.vei}` : ''}`,
              color: epoch.color,
              icon: 'volcano',
              facts: [
                { label: 'Zeitpunkt', value: whenLabel(p), emphasis: true },
                { label: 'Explosivitätsindex', value: p.vei ? `VEI ${p.vei} · ${VEI[p.vei]}` : '0 oder nicht angegeben', emphasis: p.vei >= 4 },
                { label: 'Sicherheit', value: p.conf ? 'Bestätigter Ausbruch' : 'Unsicherer Ausbruch' },
                { label: 'Vulkan-Nummer', value: String(p.vnum) },
              ],
              text: 'Die Größe folgt dem Vulkanexplosivitätsindex (VEI, 0 bis 8). Je weiter ein Ausbruch zurückliegt, desto unsicherer sind Datierung und Stärke; blasse Punkte sind unsichere Ausbrüche.',
              links: [
                { label: 'Vulkan beim Smithsonian GVP', url: `https://volcano.si.edu/volcano.cfm?vn=${p.vnum}` },
                { label: 'Wochenberichte', url: 'https://volcano.si.edu/reports_weekly.cfm' },
              ],
            };
          },
          feed: (features) =>
            features
              .filter((f) => (f.properties as EruptionProps).year >= new Date().getFullYear() - 1)
              .sort((a, b) => {
                const pa = a.properties as EruptionProps;
                const pb = b.properties as EruptionProps;
                return pb.year - pa.year || pb.vei - pa.vei;
              })
              .slice(0, 60)
              .map((f) => {
                const p = f.properties as EruptionProps;
                const c = (f.geometry as { coordinates: number[] }).coordinates;
                return {
                  id: p.id,
                  title: p.name,
                  subtitle: `${whenLabel(p)}${p.vei ? ` · VEI ${p.vei}` : ''}`,
                  magnitude: p.vei,
                  color: EPOCHS.find((e) => p.year >= e.min)!.color,
                  location: [c[0]!, c[1]!] as [number, number],
                };
              }),
        });
      } else {
        active = pointLayer(ctx, {
          data: visibleVolcano,
          resources: [resVolcano],
          idKey: 'id',
          radius: 5,
          color: ['match', ['get', 'state'], 'active', COLORS.active, 'historic', COLORS.historic, COLORS.dormant] as ExpressionSpecification,
          symbol: {
            icon: 'triangle',
            size: ['interpolate', ['linear'], ['zoom'], 1, sizeBy(0.42, 0.3, 0.22), 8, sizeBy(0.8, 0.6, 0.45)] as ExpressionSpecification,
          },
          sortKey: ['get', 'rank'] as ExpressionSpecification,
          describe: (f: AnyFeature) => {
            const p = f.properties as VolcanoProps;
            const status =
              p.state === 'active' ? `Aktiv: Ausbruch ${year(p.last!)}` : p.last !== null ? `Letzter Ausbruch ${year(p.last)}` : 'Kein Ausbruch belegt';
            return {
              title: p.name,
              subtitle: [p.type, p.country].filter(Boolean).join(' · '),
              color: COLORS[p.state],
              icon: 'volcano',
              facts: [
                { label: 'Status', value: status, emphasis: p.state === 'active' },
                ...(p.elev !== null ? [{ label: 'Höhe', value: formatWithUnit(p.elev, 'm') }] : []),
                ...(p.landform ? [{ label: 'Landform', value: p.landform }] : []),
                ...(p.setting ? [{ label: 'Tektonik', value: p.setting }] : []),
                ...(p.rock ? [{ label: 'Gestein', value: p.rock }] : []),
                ...(p.epoch ? [{ label: 'Epoche', value: p.epoch }] : []),
                ...(p.subregion || p.region ? [{ label: 'Region', value: p.subregion ?? p.region }] : []),
                ...(p.evidence ? [{ label: 'Nachweis', value: p.evidence }] : []),
                ...(p.photoCredit ? [{ label: 'Bildnachweis', value: p.photoCredit }] : []),
              ],
              media: p.photo ? { type: 'image' as const, url: p.photo } : undefined,
              text: p.summary ?? 'Das Smithsonian-Programm führt nur das Jahr des letzten Ausbruchs, nicht den aktuellen Zustand. Laufende Aktivität steht in den Wochenberichten.',
              links: [
                { label: 'Seite beim Smithsonian GVP', url: `https://volcano.si.edu/volcano.cfm?vn=${p.id}` },
                { label: 'Wochenbericht', url: 'https://volcano.si.edu/reports_weekly.cfm' },
              ],
            };
          },
          feed: (features) =>
            features
              .filter((f) => (f.properties as VolcanoProps).state === 'active')
              .sort((a, b) => (b.properties as VolcanoProps).last! - (a.properties as VolcanoProps).last! || ((b.properties as VolcanoProps).elev ?? 0) - ((a.properties as VolcanoProps).elev ?? 0))
              .slice(0, 100)
              .map((f) => {
                const p = f.properties as VolcanoProps;
                const c = (f.geometry as { coordinates: number[] }).coordinates;
                return { id: String(p.id), title: p.name, subtitle: `${p.country} · Ausbruch ${year(p.last!)}`, color: COLORS.active, location: [c[0]!, c[1]!] as [number, number] };
              }),
        });
      }
    };
    const stop = effect(() => { view.value; rebuild(); });
    rebuild();
    return { destroy() { stop(); if (active) active.destroy(); } };
  },
});
