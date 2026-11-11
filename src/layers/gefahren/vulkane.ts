// Smithsonian GVP: Holocene volcanoes as triangles, red = erupted this or last year.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatWithUnit } from '../../core/format';
import { HOUR } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import type { VolcanoCollection, VolcanoProps, VolcanoState } from '../../data/parsers/gvp';
import type { AnyFeature } from '../../render/common';
import { pointLayer } from '../../render/points';
import { defineLayer } from '../define';

const COLORS: Record<VolcanoState, string> = { active: '#FF4B2B', historic: '#FFA23A', dormant: '#8C939E' };
const LAST_YEAR = new Date().getFullYear() - 1;

const year = (y: number) => (y < 0 ? `${-y} v. Chr.` : String(y));
const sizeBy = (a: number, h: number, d: number): ExpressionSpecification => ['match', ['get', 'rank'], 2, a, 1, h, d] as ExpressionSpecification;

export default defineLayer({
  id: 'vulkane',
  category: 'gefahren',
  title: 'Vulkane',
  summary: 'Vulkane des Holozäns, rot bei Ausbruch seit dem letzten Jahr, orange seit 1900, grau ruhend',
  icon: 'volcano',
  color: COLORS.active,
  form: 'points',
  cadence: 'daily',
  sources: [{ name: 'Smithsonian Global Volcanism Program', url: 'https://volcano.si.edu/', license: 'Smithsonian, Quellenangabe', manifest: { bucket: 'data', key: 'volcanoes.json' } }],
  options: [{ id: 'onlyActive', label: 'Nur aktive', type: 'toggle', default: false }],
  legend: () => ({
    type: 'classes',
    items: [
      { color: COLORS.active, label: `Ausbruch seit ${LAST_YEAR}` },
      { color: COLORS.historic, label: 'Ausbruch seit 1900' },
      { color: COLORS.dormant, label: 'Älter oder ruhend' },
    ],
  }),
  keywords: ['vulkan', 'ausbruch', 'eruption', 'volcano', 'gvp', 'lava', 'smithsonian'],

  mount(ctx) {
    const res = ctx.resource<VolcanoCollection>({ key: 'data:volcanoes', url: bucketUrl('data', 'volcanoes.json'), parse: 'gvpVolcanoes', refresh: 6 * HOUR, timeout: 40_000 });
    const visible = computed<VolcanoCollection | undefined>(() => {
      const d = res.data.value;
      if (!d) return undefined;
      return ctx.options.value.onlyActive ? { type: 'FeatureCollection', features: d.features.filter((f) => f.properties.state === 'active') } : d;
    });
    return pointLayer(ctx, {
      data: visible,
      resources: [res],
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
            ...(p.region ? [{ label: 'Region', value: p.region }] : []),
          ],
          text: 'Das Smithsonian-Programm führt nur das Jahr des letzten Ausbruchs, nicht den aktuellen Zustand. Laufende Aktivität steht in den Wochenberichten.',
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
  },
});
