// Telephone exchanges (Vermittlungsstellen) from OpenInfraMap tiles. Data centres are covered by `rechenzentren` (PeeringDB has more detail).
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { OIM_ATTRIBUTION, OIM_SOURCE, oimTiles, osmUrl, str } from '../../data/openinframap';
import type { AnyFeature } from '../../render/common';
import { vectorTileLayer, type VtPart } from '../../render/vectortiles';
import { defineLayer } from '../define';

const COLOR = '#F472B6';
const DC = ['data_center', 'data_centre'];

const parts: VtPart[] = [
  {
    id: 'standorte', sourceLayer: 'telecoms_data_center_point', kind: 'circle', filter: ['!', ['in', ['get', 'type'], ['literal', DC]]] as FilterSpecification, color: COLOR,
    size: ['interpolate', ['linear'], ['zoom'], 3, 2.2, 9, 3.6, 14, 6] as ExpressionSpecification, minZoom: 3,
  },
];

const KIND: Record<string, string> = { exchange: 'Vermittlungsstelle', telephone_office: 'Vermittlungsstelle', central_office: 'Vermittlungsstelle' };

export default defineLayer({
  id: 'vermittlungsstellen',
  category: 'infrastruktur',
  title: 'Vermittlungsstellen (OSM)',
  summary: 'Telefon- und Datenvermittlungsstellen aus OpenStreetMap, ab Zoomstufe 3',
  icon: 'radio',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  minZoom: 3,
  sources: [OIM_SOURCE],
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Vermittlungsstelle' }] },
  keywords: ['vermittlungsstelle', 'telefon', 'exchange', 'telephone exchange', 'central office', 'hvt', 'teilnehmervermittlung', 'telekom', 'openinframap'],

  mount(ctx) {
    return vectorTileLayer(ctx, {
      tiles: oimTiles('telecoms'),
      attribution: OIM_ATTRIBUTION,
      parts,
      describe(f: AnyFeature) {
        const p = f.properties as Record<string, unknown>;
        const kind = KIND[str(p.type)] ?? 'Telekom-Standort';
        const operator = str(p.operator);
        return {
          title: str(p.name) || (operator ? `${kind} ${operator}` : kind), subtitle: kind, icon: 'radio', color: COLOR,
          facts: [...(operator ? [{ label: 'Betreiber', value: operator }] : []), ...(str(p.ref) ? [{ label: 'Kennung', value: str(p.ref) }] : []), ...(str(p.start_date) ? [{ label: 'In Betrieb seit', value: str(p.start_date) }] : [])],
          links: [{ label: 'OpenStreetMap', url: osmUrl(p) }],
        };
      },
    });
  },
});
