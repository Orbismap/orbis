// Water, sewage and hot-water pipelines, pressure tunnels and pumping stations from OpenInfraMap tiles (water set).
import { OIM_ATTRIBUTION, OIM_SOURCE, diameterLabel, oimTiles, osmUrl, str } from '../../data/openinframap';
import { HOT, PUMP, RESERVOIR, SEWAGE, SUBSTANCE, USAGE, WATER, dot, expr, flt, wikipediaLink } from '../../data/oimWater';
import type { AnyFeature } from '../../render/common';
import { vectorTileLayer, type VtPart } from '../../render/vectortiles';
import { defineLayer } from '../define';

const sewage = ['in', ['get', 'substance'], ['literal', ['sewage', 'wastewater', 'waterwaste', 'rainwater', 'drain', 'wastewate', 'water;wastewater']]];
const hot = ['in', ['get', 'substance'], ['literal', ['hot_water', 'steam']]];
const pipeColor = expr(['case', sewage, SEWAGE, hot, HOT, WATER]);
const buried = ['in', ['get', 'location'], ['literal', ['underground', 'underwater', 'underground, underwater']]];
const lineW = (k: number) => expr(['interpolate', ['linear'], ['zoom'], 3, 0.8 * k, 9, 1.5 * k, 14, 3 * k]);

const parts: VtPart[] = [
  { id: 'wasserstrasse', sourceLayer: 'pressurised_waterway', kind: 'line', color: RESERVOIR, size: lineW(1.2), casing: true, minZoom: 4 },
  { id: 'leitung', sourceLayer: 'water_pipeline', kind: 'line', filter: flt(['!', buried]), color: pipeColor, size: lineW(1), minZoom: 5 },
  { id: 'leitung-erde', sourceLayer: 'water_pipeline', kind: 'line', filter: flt(buried), color: pipeColor, size: lineW(1), dash: [2, 1.4], minZoom: 5 },
  { id: 'pumpwerk', sourceLayer: 'pumping_station_point', kind: 'circle', color: PUMP, size: dot(1.8, 3.6), minZoom: 9 },
];

export default defineLayer({
  id: 'wasserleitungen',
  category: 'wasser',
  title: 'Wasserleitungen und Pumpwerke',
  summary: 'Wasser-, Abwasser- und Heißwasserleitungen, Druckstollen und Pumpwerke aus OpenStreetMap, ab Zoomstufe 5',
  icon: 'drop',
  color: WATER,
  form: 'lines',
  cadence: 'daily',
  minZoom: 5,
  sources: [OIM_SOURCE],
  legend: {
    type: 'classes',
    items: [
      { color: WATER, label: 'Wasserleitung', shape: 'line' }, { color: SEWAGE, label: 'Abwasser, Regenwasser', shape: 'line' }, { color: HOT, label: 'Heißwasser, Dampf', shape: 'line' },
      { color: RESERVOIR, label: 'Druckstollen', shape: 'line' }, { color: PUMP, label: 'Pumpwerk' },
    ],
  },
  keywords: ['wasser', 'wasserleitung', 'abwasser', 'kanal', 'pumpwerk', 'druckstollen', 'trinkwasser', 'fernwasser', 'water', 'pipeline', 'sewage', 'openinframap'],

  mount(ctx) {
    return vectorTileLayer(ctx, {
      tiles: oimTiles('water'),
      attribution: OIM_ATTRIBUTION,
      parts,
      describe(f: AnyFeature, part) {
        const p = f.properties as Record<string, unknown>;
        const operator = str(p.operator);
        const since = str(p.start_date) ? [{ label: 'In Betrieb seit', value: str(p.start_date) }] : [];
        const links = [{ label: 'OpenStreetMap', url: osmUrl(p) }, ...wikipediaLink(p)];
        if (part.id === 'wasserstrasse') {
          return { title: str(p.name) || 'Druckstollen', subtitle: 'Druckstollen', icon: 'wave', color: RESERVOIR, facts: [...(operator ? [{ label: 'Betreiber', value: operator }] : []), ...since], links };
        }
        if (part.id === 'pumpwerk') {
          const sub = SUBSTANCE[str(p.substance)];
          return { title: str(p.name) || 'Pumpwerk', subtitle: 'Pumpwerk', icon: 'drop', color: PUMP, facts: [...(sub ? [{ label: 'Stoff', value: sub }] : []), ...(operator ? [{ label: 'Betreiber', value: operator }] : []), ...since], links };
        }
        const sub = SUBSTANCE[str(p.substance)] ?? 'Wasser';
        const dia = diameterLabel(p.diameter);
        return {
          title: str(p.name) || `${sub}leitung`, subtitle: `Leitung · ${sub}`, icon: 'drop', color: sub === 'Wasser' ? WATER : undefined,
          facts: [{ label: 'Stoff', value: sub, emphasis: true }, ...(dia ? [{ label: 'Durchmesser', value: dia }] : []), ...(USAGE[str(p.usage)] ? [{ label: 'Art', value: USAGE[str(p.usage)]! }] : []), ...(operator ? [{ label: 'Betreiber', value: operator }] : []), ...since],
          links,
        };
      },
    });
  },
});
