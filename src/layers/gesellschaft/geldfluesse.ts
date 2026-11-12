// Money flows between countries according to public registers (charity returns, lobbying and foreign-agent filings):
// one curved line per record class. Data: "Who Funded Genocide" (whofundedgenocide.com), CC BY 4.0, copied to public/data.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatInt } from '../../core/format';
import { flowLines, type ArcProps, type CountryProps, type FlowCls, type FlowData } from '../../data/parsers/money';
import { lineLayer } from '../../render/lines';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const CLS: Record<FlowCls, { color: string; label: string; dash?: number[] }> = {
  money: { color: '#FFD54F', label: 'Geld, laut Register geflossen' },
  ordered: { color: '#FFB74D', label: 'Bestellt oder beauftragt', dash: [3, 2] },
  ceiling: { color: '#BA8F45', label: 'Genehmigte Obergrenze (Maximum)', dash: [1, 2] },
  structure: { color: '#90A4AE', label: 'Nationale Sektion, kein Geld', dash: [1, 2] },
};
const SYMBOL: Record<string, string> = { CAD: 'C$', AUD: 'A$', GBP: '£', USD: '$', ILS: '₪', EUR: '€' };
const URL_ = 'https://whofundedgenocide.com/map/';
const SRC = [{ label: 'Who Funded Genocide, The Entire Network (CC BY 4.0)', url: URL_ }];

export default defineLayer({
  id: 'geldfluesse',
  category: 'gesellschaft',
  title: 'Geldflüsse nach Registern',
  summary: 'Geldflüsse zwischen Ländern laut Wohltätigkeits-, Lobby- und Auslandsagenten-Registern',
  icon: 'people',
  color: '#FFD54F',
  form: 'lines',
  cadence: 'static',
  sources: [{ name: '"The Entire Network." Who Funded Genocide, in Zusammenarbeit mit Wallface; Quellen je Linie in der Karte', url: URL_, license: 'CC BY 4.0' }],
  legend: { type: 'classes', items: (Object.keys(CLS) as FlowCls[]).map((k) => ({ color: CLS[k].color, label: CLS[k].label, shape: 'line' as const })) },
  keywords: ['geld', 'finanzierung', 'spenden', 'lobby', 'fara', 'charity', 'whofundedgenocide', 'israel', 'register'],

  mount(ctx) {
    const raw = ctx.resource<FlowData>({ key: 'static:geldfluesse', url: `${import.meta.env.BASE_URL}data/geldfluesse.json`, timeout: 30_000 });
    const lines = computed(() => (raw.data.value ? flowLines(raw.data.value) : undefined));
    const arcs = computed(() => lines.value?.arcs);
    const countries = computed(() => lines.value?.countries);
    const clsColor = ['match', ['get', 'cls'], ...(Object.keys(CLS) as FlowCls[]).flatMap((k) => [k, CLS[k].color]), '#FFD54F'] as unknown as ExpressionSpecification;

    const countryLayer = pointLayer({ ...ctx, status: () => {} }, {
      data: countries as never, name: 'laender', idKey: 'id',
      radius: ['interpolate', ['linear'], ['zoom'], 1, 3.5, 6, 6] as unknown as ExpressionSpecification,
      color: '#F5F5F5', stroke: { color: 'rgba(20,20,20,0.9)', width: 1.2 },
      describe: (f: AnyFeature) => {
        const p = f.properties as CountryProps;
        return { title: p.name, subtitle: 'Land in den Registerdaten', color: '#F5F5F5', icon: 'people', facts: (JSON.parse(p.notes) as string[]).map((n) => { const i = n.indexOf(':'); return { label: i > 0 ? n.slice(0, i) : 'Hinweis', value: i > 0 ? n.slice(i + 1).trim() : n }; }), links: SRC };
      },
    });
    const arcLayer = lineLayer(ctx, {
      data: arcs as never, resources: [raw], idKey: 'id', name: 'fluesse',
      color: clsColor,
      width: ['interpolate', ['linear'], ['zoom'], 1, 1.6, 6, 3.2] as unknown as ExpressionSpecification,
      casing: true,
      opacity: 0.9,
      describe: (f: AnyFeature) => {
        const p = f.properties as ArcProps;
        const amounts = JSON.parse(p.amounts) as { currency: string; amount: number }[];
        const sources = JSON.parse(p.sources) as { id: string; title: string; url: string; locator: string }[];
        return {
          title: `${p.from} nach ${p.to}`,
          subtitle: p.label,
          color: CLS[p.cls]?.color,
          icon: 'people',
          facts: [
            ...amounts.map((a) => ({ label: 'Betrag laut Quelle', value: `${SYMBOL[a.currency] ?? `${a.currency} `}${formatInt(a.amount)}`, emphasis: true })),
            { label: 'Einträge', value: formatInt(p.lines) },
            { label: 'Art', value: CLS[p.cls]?.label ?? p.cls },
          ],
          text: p.text,
          links: [...sources.slice(0, 6).map((s) => ({ label: `${s.id}: ${s.title.slice(0, 80)}`, url: s.url })), ...SRC],
        };
      },
    });
    return { destroy() { arcLayer.destroy(); countryLayer.destroy(); } };
  },
});
