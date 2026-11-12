// Shared mount of the election layers (wahlen, wahlen-usa): results at the selected time as coloured areas + card.
import { computed } from '@preact/signals';
import type { FeatureCollection } from 'geojson';
import { formatDate, formatInt, formatPercent } from '../../core/format';
import { areaLayer } from '../../render/areas';
import type { AnyFeature } from '../../render/common';
import type { InspectCard, LayerContext, LayerHandle } from '../../layers/types';
import { areaCollection, resultsAt, type AreaProps, type Election, type ElKind, type PartyDef } from './wahlen';

export interface ElectionLayerCfg<D> {
  docUrl: string; geoUrl: string; key: string;
  elections(doc: D): Election[];
  regions(doc: D): Record<string, string>;
  parties: PartyDef[];
  kinds(options: Record<string, unknown>): ElKind[];
  icon: InspectCard['icon'];
  sources: { label: string; url: string }[];
}

export function electionLayer<D>(ctx: LayerContext, cfg: ElectionLayerCfg<D>): LayerHandle {
  const doc = ctx.resource<D>({ key: `wahlen:${cfg.key}`, url: cfg.docUrl, timeout: 30_000 });
  const geo = ctx.resource<FeatureCollection>({ key: `wahlen:${cfg.key}-geo`, url: cfg.geoUrl, timeout: 30_000 });
  const elections = computed(() => (doc.data.value ? cfg.elections(doc.data.value) : undefined));
  const data = computed(() => {
    const d = doc.data.value, g = geo.data.value, el = elections.value;
    if (!d || !g || !el) return undefined;
    const names = cfg.regions(d);
    return areaCollection(g, resultsAt(el, ctx.time.value, cfg.kinds(ctx.options.value), Object.keys(names)), cfg.parties, names);
  });
  const label = new Map(cfg.parties.map((p) => [p.id, p.label]));
  return areaLayer(ctx, {
    data: data as never,
    resources: [doc, geo],
    idKey: 'k',
    fill: ['get', 'color'] as never,
    fillOpacity: ['interpolate', ['linear'], ['get', 'margin'], 0, 0.45, 0.25, 0.8] as never,
    outline: { color: 'rgba(255,255,255,0.45)', width: 0.8 },
    describe: (f: AnyFeature) => {
      const p = f.properties as AreaProps;
      const rows = (JSON.parse(p.parties) as [string, number][]).slice().sort((a, b) => b[1] - a[1]);
      const sum = rows.reduce((s, r) => s + r[1], 0);
      const cand = p.cand ? (JSON.parse(p.cand) as Record<string, string>) : {};
      const cn = (id: string) => (id === 'DEMOCRAT' ? cand.D : id === 'REPUBLICAN' ? cand.R : undefined);
      return {
        title: p.n,
        subtitle: `${p.election} · ${formatDate(p.t)}`,
        time: p.t,
        color: p.color,
        icon: cfg.icon,
        facts: [
          ...rows.map((r, i) => ({ label: [label.get(r[0]) ?? r[0], cn(r[0])].filter(Boolean).join(' · '), value: `${formatPercent(r[1] / sum, 1)} (${formatInt(r[1])})`, emphasis: i === 0 })),
          ...(p.turnout && p.kind !== 'pres' ? [{ label: 'Wahlbeteiligung', value: `${p.turnout.toFixed(1).replace('.', ',')} %` }] : []),
          { label: 'Stimmen gezählt', value: formatInt(sum) },
        ],
        links: cfg.sources.map((s) => ({ label: s.label, url: s.url })),
      };
    },
  });
}
