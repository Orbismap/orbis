// Seaports worldwide: NGA World Port Index (size, depths, vessel limits, facilities) plus the UN/LOCODE seaports (Upply)
// it does not list. Size classes appear by zoom: large from the start, medium from 3.5, small from 5, very small from 6.5,
// the UN/LOCODE-only ones from 8.5. Data: public/data/ports.json (900 KB, bundled with the app).
import { computed } from '@preact/signals';
import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { formatNumber } from '../../core/format';
import type { PortProps } from '../../data/parsers/ports';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';
import type { LayerHandle } from '../types';

const COLOR = '#35c2c9';
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const URL_ = `${env.BASE_URL ?? './'}data/ports.json`;
const TIERS: { tier: number; minZoom: number; r: [number, number, number]; labelZoom: number }[] = [
  { tier: 1, minZoom: 0, r: [4, 6.5, 9], labelZoom: 3.5 },
  { tier: 2, minZoom: 3.5, r: [3, 5, 7.5], labelZoom: 5.5 },
  { tier: 3, minZoom: 5, r: [2.5, 4, 6], labelZoom: 7 },
  { tier: 4, minZoom: 6.5, r: [2, 3.5, 5], labelZoom: 8.5 },
  { tier: 5, minZoom: 8.5, r: [1.8, 3, 4], labelZoom: 10 },
];
const meters = (v: number) => `${formatNumber(v, v < 10 ? 1 : 0)} m`;

const describe = (f: AnyFeature) => {
  const p = f.properties as PortProps;
  const facts: { label: string; value: string; emphasis?: boolean }[] = [{ label: 'Größe', value: p.size, emphasis: true }];
  if (p.type) facts.push({ label: 'Hafenart', value: p.type });
  if (p.channel) facts.push({ label: 'Tiefe Fahrrinne', value: meters(p.channel) });
  if (p.pier) facts.push({ label: 'Tiefe am Kai', value: meters(p.pier) });
  if (p.draft) facts.push({ label: 'Max. Tiefgang', value: meters(p.draft) });
  if (p.length) facts.push({ label: 'Max. Schiffslänge', value: `${formatNumber(p.length)} m` });
  if (p.pilot) facts.push({ label: 'Lotsenpflicht', value: p.pilot });
  if (p.shelter) facts.push({ label: 'Schutz', value: p.shelter });
  if (p.fac) facts.push({ label: 'Umschlag', value: p.fac });
  if (p.code) facts.push({ label: 'UN/LOCODE', value: p.code });
  if (p.country) facts.push({ label: 'Land', value: p.country });
  return {
    title: p.name, subtitle: `${p.size}${p.country ? ` · ${p.country}` : ''}`, color: COLOR, icon: 'anchor' as const, facts,
    ...(p.wpi ? {} : { text: 'Nur in der UN/LOCODE-Liste, ohne Tiefen- und Anlagendaten.' }),
  };
};

export default defineLayer({
  id: 'haefen',
  category: 'verkehr',
  title: 'Häfen',
  summary: 'Seehäfen weltweit nach Größe, mit Tiefen, größtem Schiff und Umschlag',
  icon: 'anchor',
  color: COLOR,
  form: 'points',
  cadence: 'static',
  sources: [
    { name: 'NGA World Port Index (Pub. 150)', url: 'https://msi.nga.mil/Publications/WPI', license: 'US-Regierungswerk, gemeinfrei' },
    { name: 'Upply Seaports Locations (UN/LOCODE)', url: 'https://www.data.gouv.fr/datasets/seaports-locations-data/', license: 'CC BY 4.0' },
  ],
  legend: { type: 'classes', items: [{ color: '#ffffff', label: 'Großer Hafen', shape: 'dot' }, { color: '#35c2c9', label: 'Mittel', shape: 'dot' }, { color: '#2a8f97', label: 'Klein', shape: 'dot' }, { color: '#1d6a72', label: 'Sehr klein / UN/LOCODE', shape: 'dot' }] },
  keywords: ['hafen', 'port', 'seehafen', 'anchor', 'container', 'wpi', 'harbour', 'harbor'],

  mount(ctx) {
    const res = ctx.resource<FeatureCollection<Point, PortProps>>({ key: 'static:ports', url: URL_, parse: 'portsParse', timeout: 30_000 });
    const pick = (tier: number) => computed<FeatureCollection<Point, PortProps> | undefined>(() => {
      const d = res.data.value;
      return d ? { type: 'FeatureCollection', features: d.features.filter((f) => f.properties.tier === tier) } : undefined;
    });
    const fills = ['#ffffff', '#35c2c9', '#2a8f97', '#1d6a72', '#1d6a72'];
    const handles: LayerHandle[] = [];
    for (const t of TIERS) {
      const radius = ['interpolate', ['linear'], ['zoom'], 1, t.r[0], 6, t.r[1], 12, t.r[2]] as unknown as ExpressionSpecification;
      handles.push(pointLayer(ctx, {
        data: pick(t.tier), resources: t.tier === 1 ? [res] : undefined, name: `t${t.tier}`, minZoom: t.minZoom || undefined, radius, color: fills[t.tier - 1]!,
        stroke: { color: '#0a2a30', width: 1.2 }, describe,
      }));
      ctx.map.addLayer({
        id: `${ctx.id}.t${t.tier}-labels`, type: 'symbol', source: `${ctx.id}.t${t.tier}-src`, minzoom: t.labelZoom,
        layout: { 'text-field': ['get', 'name'] as unknown as ExpressionSpecification, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': '#c9f3f5', 'text-halo-color': 'rgba(10, 15, 24, 0.9)', 'text-halo-width': 1.4 },
      } as LayerSpecification, 'labels');
    }
    return {
      destroy() {
        ctx.map.remove({ layers: TIERS.map((t) => `${ctx.id}.t${t.tier}-labels`).reverse() });
        for (const h of handles.reverse()) h.destroy();
      },
    };
  },
});
