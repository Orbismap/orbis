// Telecom lines from OpenInfraMap tiles: submarine cables (blue), underground cables (purple) and overhead lines (orange).
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { OIM_ATTRIBUTION, OIM_SOURCE, oimTiles, osmUrl, str } from '../../data/openinframap';
import type { AnyFeature } from '../../render/common';
import { vectorTileLayer, type VtPart } from '../../render/vectortiles';
import { defineLayer } from '../define';

const SEA = '#4FC3F7', GROUND = '#B388FF', AIR = '#FFB020';
const expr = (e: unknown) => e as ExpressionSpecification;
const flt = (e: unknown) => e as FilterSpecification;
const loc = (...v: string[]) => ['in', ['get', 'location'], ['literal', v]];
const width = (k: number) => expr(['interpolate', ['linear'], ['zoom'], 1, 0.9 * k, 6, 1.6 * k, 12, 3 * k]);

const parts: VtPart[] = [
  { id: 'luft', sourceLayer: 'telecoms_communication_line', kind: 'line', filter: flt(loc('overhead', 'air')), color: AIR, size: width(0.8), opacity: 0.85, minZoom: 5 },
  { id: 'erde', sourceLayer: 'telecoms_communication_line', kind: 'line', filter: flt(loc('underground')), color: GROUND, size: width(0.9), dash: [2, 1.6], opacity: 0.9, minZoom: 4 },
  // everything else (underwater, unset) is a sea cable
  { id: 'see', sourceLayer: 'telecoms_communication_line', kind: 'line', filter: flt(['!', loc('overhead', 'air', 'underground')]), color: SEA, size: width(1.1), casing: true, minZoom: 1 },
];

const LOC: Record<string, string> = { underwater: 'Seekabel', underground: 'Erdkabel', overhead: 'Freileitung', air: 'Freileitung' };

export default defineLayer({
  id: 'telekomnetz',
  category: 'infrastruktur',
  title: 'Telekom-Leitungen (OSM)',
  summary: 'Seekabel sowie Erdkabel und Freileitungen der Telekommunikation aus OpenStreetMap',
  icon: 'cable',
  color: SEA,
  form: 'lines',
  cadence: 'daily',
  minZoom: 1,
  sources: [OIM_SOURCE],
  legend: {
    type: 'classes',
    items: [{ color: SEA, label: 'Seekabel', shape: 'line' }, { color: GROUND, label: 'Erdkabel (gestrichelt)', shape: 'line' }, { color: AIR, label: 'Freileitung', shape: 'line' }],
  },
  keywords: ['seekabel', 'unterseekabel', 'glasfaser', 'telekom', 'telefon', 'kabel', 'internet', 'submarine', 'cable', 'openinframap'],

  mount(ctx) {
    return vectorTileLayer(ctx, {
      tiles: oimTiles('telecoms'),
      attribution: OIM_ATTRIBUTION,
      parts,
      describe(f: AnyFeature, part) {
        const p = f.properties as Record<string, unknown>;
        const kind = LOC[str(p.location)] ?? (part.id === 'see' ? 'Seekabel' : 'Telekommunikationsleitung');
        return {
          title: str(p.name) || (str(p.ref) ? `${kind} ${str(p.ref)}` : kind), subtitle: kind, icon: 'cable', color: part.id === 'see' ? SEA : part.id === 'erde' ? GROUND : AIR,
          facts: [
            ...(str(p.operator) ? [{ label: 'Betreiber', value: str(p.operator) }] : []),
            ...(str(p.ref) ? [{ label: 'Kennung', value: str(p.ref) }] : []),
            ...(str(p.start_date) ? [{ label: 'In Betrieb seit', value: str(p.start_date) }] : []),
          ],
          links: [{ label: 'OpenStreetMap', url: osmUrl(p) }],
        };
      },
    });
  },
});
