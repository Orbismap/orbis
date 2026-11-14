// Reservoirs and water storage (Stauseen, Wasserspeicher, Hochbehälter) from OpenInfraMap tiles (water set).
import { OIM_ATTRIBUTION, OIM_SOURCE, oimTiles, osmUrl, str } from '../../data/openinframap';
import { RESERVOIR, dot, wikipediaLink } from '../../data/oimWater';
import type { AnyFeature } from '../../render/common';
import { vectorTileLayer, type VtPart } from '../../render/vectortiles';
import { defineLayer } from '../define';

const parts: VtPart[] = [
  { id: 'speicher-flaeche', sourceLayer: 'water_reservoir', kind: 'fill', color: RESERVOIR, minZoom: 6 },
  { id: 'speicher', sourceLayer: 'water_reservoir_point', kind: 'circle', color: RESERVOIR, size: dot(2, 4), minZoom: 7 },
];

const TYPE: Record<string, string> = { reservoir: 'Wasserspeicher', reservoir_covered: 'Hochbehälter (abgedeckt)' };

export default defineLayer({
  id: 'stauseen',
  category: 'wasser',
  title: 'Stauseen und Wasserspeicher',
  summary: 'Talsperren, Speicherbecken und Hochbehälter aus OpenStreetMap, ab Zoomstufe 6',
  icon: 'wave',
  color: RESERVOIR,
  form: 'areas',
  cadence: 'daily',
  minZoom: 6,
  sources: [OIM_SOURCE],
  legend: { type: 'classes', items: [{ color: RESERVOIR, label: 'Stausee, Speicherbecken, Hochbehälter', shape: 'square' }] },
  keywords: ['stausee', 'talsperre', 'speicher', 'wasserspeicher', 'hochbehälter', 'reservoir', 'staudamm', 'openinframap'],

  mount(ctx) {
    return vectorTileLayer(ctx, {
      tiles: oimTiles('water'),
      attribution: OIM_ATTRIBUTION,
      parts,
      describe(f: AnyFeature) {
        const p = f.properties as Record<string, unknown>;
        const kind = TYPE[str(p.type)] ?? 'Wasserspeicher';
        return {
          title: str(p.name) || kind, subtitle: kind, icon: 'wave', color: RESERVOIR,
          facts: [...(str(p.operator) ? [{ label: 'Betreiber', value: str(p.operator) }] : []), ...(str(p.ref) ? [{ label: 'Kennung', value: str(p.ref) }] : []), ...(str(p.start_date) ? [{ label: 'In Betrieb seit', value: str(p.start_date) }] : [])],
          links: [{ label: 'OpenStreetMap', url: osmUrl(p) }, ...wikipediaLink(p)],
        };
      },
    });
  },
});
