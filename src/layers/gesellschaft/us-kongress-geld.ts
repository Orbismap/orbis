// PAC money per US congressional district (FEC filings, via whofundedgenocide.com, CC BY 4.0): one circle per district,
// sized by the recorded sum, coloured by party. Data: public/data/moneyflow.json (House only; senators have no district).
import type { ExpressionSpecification } from 'maplibre-gl';
import { computed } from '@preact/signals';
import { formatInt } from '../../core/format';
import { congressPoints, type Member, type MemberProps } from '../../data/parsers/money';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const PARTY: Record<string, { label: string; color: string }> = { GOP: { label: 'Republikaner', color: '#E0524B' }, DEM: { label: 'Demokraten', color: '#3B7DD8' } };
const OTHER = '#B0A0D8';
const usd = (v: number) => `$${formatInt(v)}`;

export default defineLayer({
  id: 'us-kongress-geld',
  category: 'gesellschaft',
  title: 'Kongress: PAC-Gelder',
  summary: 'Geld pro-israelischer Lobbygruppen für Abgeordnete des US-Repräsentantenhauses, ein Kreis je Wahlbezirk',
  icon: 'people',
  color: '#B0A0D8',
  form: 'points',
  cadence: 'static',
  coverage: 'USA',
  sources: [{ name: 'FEC-Bulk-Daten, aufbereitet von Who Funded Genocide; Wahlbezirke: unitedstates/districts (2012)', url: 'https://whofundedgenocide.com/', license: 'CC BY 4.0' }],
  legend: { type: 'classes', items: [{ color: PARTY.GOP!.color, label: 'Republikaner' }, { color: PARTY.DEM!.color, label: 'Demokraten' }, { color: OTHER, label: 'Sonstige (Größe: erfasste Summe)' }] },
  keywords: ['kongress', 'pac', 'aipac', 'lobby', 'fec', 'abgeordnete', 'spenden', 'usa', 'wahlkampf'],

  mount(ctx) {
    const raw = ctx.resource<{ members?: Member[]; built?: string }>({ key: 'static:moneyflow', url: `${import.meta.env.BASE_URL}data/moneyflow.json`, timeout: 30_000 });
    const data = computed(() => (raw.data.value ? congressPoints(raw.data.value) : undefined));
    return pointLayer(ctx, {
      data: data as never,
      resources: [raw],
      radius: ['interpolate', ['linear'], ['zoom'], 2, ['max', 1.8, ['*', 0.012, ['sqrt', ['get', 'sum']]]], 8, ['max', 3, ['*', 0.03, ['sqrt', ['get', 'sum']]]]] as unknown as ExpressionSpecification,
      color: ['match', ['get', 'party'], 'GOP', PARTY.GOP!.color, 'DEM', PARTY.DEM!.color, OTHER] as unknown as ExpressionSpecification,
      stroke: { color: 'rgba(15,15,25,0.85)', width: 0.8 },
      sortKey: ['-', 0, ['get', 'sum']] as unknown as ExpressionSpecification,
      describe: (f: AnyFeature) => {
        const p = f.properties as MemberProps;
        const party = PARTY[p.party];
        return {
          title: p.name,
          subtitle: `${party?.label ?? p.party} · Wahlbezirk ${p.district}`,
          color: party?.color ?? OTHER,
          icon: 'people',
          facts: [
            { label: 'Erfasste Summe', value: usd(p.sum), emphasis: true },
            { label: 'Direkte PAC-Beiträge', value: usd(p.don) },
            ...(p.aipac ? [{ label: 'davon über AIPAC', value: usd(p.aipac) }] : []),
            ...(p.ie ? [{ label: 'Unabhängige Ausgaben (Kampagnenwerbung)', value: usd(p.ie) }] : []),
            ...(p.backers ? [{ label: 'Beteiligte Gruppen', value: p.backers }] : []),
          ],
          text: 'Summen aus den Meldungen an die US-Wahlkommission FEC, so wie sie das Projekt zusammenstellt.',
          links: [{ label: 'Who Funded Genocide (CC BY 4.0)', url: 'https://whofundedgenocide.com/' }, { label: 'FEC', url: 'https://www.fec.gov/data/' }],
        };
      },
    });
  },
});
