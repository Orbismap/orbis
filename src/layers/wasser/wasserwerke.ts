// Water treatment plants (Wasserwerke) and wastewater plants (Kläranlagen) from OpenInfraMap tiles (water set).
import { OIM_ATTRIBUTION, OIM_SOURCE, oimTiles, osmUrl, str } from '../../data/openinframap';
import { TREAT, WASTE, dot, wikipediaLink } from '../../data/oimWater';
import type { AnyFeature } from '../../render/common';
import { vectorTileLayer, type VtPart } from '../../render/vectortiles';
import { defineLayer } from '../define';

const parts: VtPart[] = [
  { id: 'wasserwerk', sourceLayer: 'water_treatment_plant_point', kind: 'circle', color: TREAT, size: dot(2.4, 5), minZoom: 6 },
  { id: 'klaerwerk', sourceLayer: 'wastewater_plant_point', kind: 'circle', color: WASTE, size: dot(2.4, 5), minZoom: 6 },
];

export default defineLayer({
  id: 'wasserwerke',
  category: 'wasser',
  title: 'Wasserwerke und Kläranlagen',
  summary: 'Trinkwasseraufbereitung und Abwasserreinigung aus OpenStreetMap, ab Zoomstufe 6',
  icon: 'drop',
  color: TREAT,
  form: 'points',
  cadence: 'daily',
  minZoom: 6,
  sources: [OIM_SOURCE],
  legend: { type: 'classes', items: [{ color: TREAT, label: 'Wasserwerk' }, { color: WASTE, label: 'Kläranlage' }] },
  keywords: ['wasserwerk', 'kläranlage', 'klärwerk', 'abwasser', 'trinkwasser', 'aufbereitung', 'water treatment', 'wastewater', 'openinframap'],

  mount(ctx) {
    return vectorTileLayer(ctx, {
      tiles: oimTiles('water'),
      attribution: OIM_ATTRIBUTION,
      parts,
      describe(f: AnyFeature, part) {
        const p = f.properties as Record<string, unknown>;
        const isTreat = part.id === 'wasserwerk';
        const kind = isTreat ? 'Wasserwerk' : 'Kläranlage';
        return {
          title: str(p.name) || kind, subtitle: kind, icon: 'drop', color: isTreat ? TREAT : WASTE,
          facts: [...(str(p.operator) ? [{ label: 'Betreiber', value: str(p.operator) }] : []), ...(str(p.ref) ? [{ label: 'Kennung', value: str(p.ref) }] : []), ...(str(p.start_date) ? [{ label: 'In Betrieb seit', value: str(p.start_date) }] : [])],
          links: [{ label: 'OpenStreetMap', url: osmUrl(p) }, ...wikipediaLink(p)],
        };
      },
    });
  },
});
