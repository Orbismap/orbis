// Oil, gas and chemical pipelines from OpenInfraMap tiles (petroleum set). Colour = substance.
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { OIM_ATTRIBUTION, OIM_SOURCE, diameterLabel, oimTiles, osmUrl, str } from '../../data/openinframap';
import type { AnyFeature } from '../../render/common';
import { vectorTileLayer, type VtPart } from '../../render/vectortiles';
import { defineLayer } from '../define';

const COLOR = '#FFD166';
const expr = (e: unknown) => e as ExpressionSpecification;
const flt = (e: unknown) => e as FilterSpecification;

const SUBSTANCES: Record<string, { label: string; color: string; match: string[] }> = {
  gas: { label: 'Erdgas', color: '#FFD166', match: ['gas', 'natural_gas', 'lng', 'cng', 'lpg'] },
  oil: { label: 'Erdöl und Kraftstoffe', color: '#E5533D', match: ['oil', 'fuel', 'crude_oil', 'petroleum', 'diesel', 'kerosene', 'gasoline'] },
  hydrogen: { label: 'Wasserstoff', color: '#C77DFF', match: ['hydrogen'] },
  chemical: { label: 'Chemikalien (Ethylen, Propylen …)', color: '#2EC4B6', match: ['ethylene', 'propylene', 'hydrocarbons', 'ethane', 'propane', 'butane', 'chemicals', 'ammonia', 'co2', 'carbon_dioxide'] },
};
const OTHER = '#9AA3B2';
const color = expr(['match', ['get', 'substance'], ...Object.values(SUBSTANCES).flatMap((s) => [s.match, s.color]), OTHER]);
const buried = ['in', ['get', 'location'], ['literal', ['underground', 'underwater']]];
const active = ['all', ['!=', ['get', 'disused'], true], ['!=', ['get', 'construction'], true]];
const width = (k: number) => expr(['interpolate', ['linear'], ['zoom'], 2, 0.8 * k, 7, 1.6 * k, 12, 3 * k]);

const parts: VtPart[] = [
  { id: 'ober', sourceLayer: 'petroleum_pipeline', kind: 'line', filter: flt(['all', active, ['!', buried]]), color, size: width(1), casing: true, minZoom: 2 },
  { id: 'unter', sourceLayer: 'petroleum_pipeline', kind: 'line', filter: flt(['all', active, buried]), color, size: width(1), dash: [2, 1.4], minZoom: 2 },
];

const LOCATION: Record<string, string> = { underground: 'Unterirdisch', underwater: 'Unter Wasser', overground: 'Oberirdisch', overhead: 'Auf Stützen', surface: 'Oberirdisch' };
const USAGE: Record<string, string> = { transmission: 'Fernleitung', distribution: 'Verteilleitung', gathering: 'Sammelleitung', transportation: 'Transport' };

export default defineLayer({
  id: 'oelgasleitungen',
  category: 'infrastruktur',
  title: 'Öl- und Gasleitungen (OSM)',
  summary: 'Fernleitungen für Erdgas, Erdöl, Wasserstoff und Chemikalien aus OpenStreetMap, Farbe nach Stoff',
  icon: 'flame',
  color: COLOR,
  form: 'lines',
  cadence: 'daily',
  minZoom: 2,
  sources: [OIM_SOURCE],
  legend: {
    type: 'classes',
    items: [...Object.values(SUBSTANCES).map((s) => ({ color: s.color, label: s.label, shape: 'line' as const })), { color: OTHER, label: 'Sonstige oder unbekannt', shape: 'line' as const }, { color: '#C9D1DC', label: 'Gestrichelt: unterirdisch oder unter Wasser', shape: 'line' as const }],
  },
  keywords: ['pipeline', 'gas', 'erdgas', 'öl', 'erdöl', 'wasserstoff', 'leitung', 'nord stream', 'lng', 'fernleitung', 'openinframap', 'ethylen'],

  mount(ctx) {
    return vectorTileLayer(ctx, {
      tiles: oimTiles('petroleum'),
      attribution: OIM_ATTRIBUTION,
      parts,
      describe(f: AnyFeature) {
        const p = f.properties as Record<string, unknown>;
        const sub = Object.values(SUBSTANCES).find((s) => s.match.includes(str(p.substance)));
        const dia = diameterLabel(p.diameter);
        const pressure = str(p.pressure);
        return {
          title: str(p.name) || (str(p.ref) ? `Leitung ${str(p.ref)}` : `${sub?.label ?? 'Pipeline'}`), subtitle: `Pipeline${sub ? ` · ${sub.label}` : ''}`, icon: 'flame', color: sub?.color ?? OTHER,
          facts: [
            ...(sub || str(p.substance) ? [{ label: 'Stoff', value: sub?.label ?? str(p.substance), emphasis: true }] : []),
            ...(dia ? [{ label: 'Durchmesser', value: dia }] : []),
            ...(pressure ? [{ label: 'Druck', value: /^[\d.,]+$/.test(pressure) ? `${pressure} bar` : pressure }] : []),
            ...(USAGE[str(p.usage)] ? [{ label: 'Art', value: USAGE[str(p.usage)]! }] : []),
            ...(LOCATION[str(p.location)] ? [{ label: 'Verlegung', value: LOCATION[str(p.location)]! }] : []),
            ...(str(p.operator) ? [{ label: 'Betreiber', value: str(p.operator) }] : []),
            ...(str(p.ref) ? [{ label: 'Kennung', value: str(p.ref) }] : []),
            ...(str(p.start_date) ? [{ label: 'In Betrieb seit', value: str(p.start_date) }] : []),
          ],
          links: [{ label: 'OpenStreetMap', url: osmUrl(p) }, ...(str(p.wikipedia) ? [{ label: 'Wikipedia', url: `https://${str(p.wikipedia).split(':')[0]}.wikipedia.org/wiki/${encodeURIComponent(str(p.wikipedia).split(':').slice(1).join(':'))}` }] : [])],
        };
      },
    });
  },
});
