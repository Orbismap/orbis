// Water infrastructure from OpenInfraMap tiles (water set): pipelines, treatment and wastewater plants, reservoirs, pumping stations.
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { OIM_ATTRIBUTION, OIM_SOURCE, diameterLabel, oimTiles, osmUrl, str } from '../../data/openinframap';
import type { AnyFeature } from '../../render/common';
import { vectorTileLayer, type VtPart } from '../../render/vectortiles';
import { defineLayer } from '../define';

const COLOR = '#3E8BFF';
const WATER = '#3E8BFF', HOT = '#FF7A59', SEWAGE = '#A98467', TREAT = '#2EC4B6', WASTE = '#C08552', RESERVOIR = '#7CC4FF', PUMP = '#9AA3B2';
const expr = (e: unknown) => e as ExpressionSpecification;
const flt = (e: unknown) => e as FilterSpecification;

const sewage = ['in', ['get', 'substance'], ['literal', ['sewage', 'wastewater', 'waterwaste', 'rainwater', 'drain', 'wastewate', 'water;wastewater']]];
const hot = ['in', ['get', 'substance'], ['literal', ['hot_water', 'steam']]];
const pipeColor = expr(['case', sewage, SEWAGE, hot, HOT, WATER]);
const buried = ['in', ['get', 'location'], ['literal', ['underground', 'underwater', 'underground, underwater']]];
const lineW = (k: number) => expr(['interpolate', ['linear'], ['zoom'], 3, 0.8 * k, 9, 1.5 * k, 14, 3 * k]);
const dot = (min: number, max: number) => expr(['interpolate', ['linear'], ['zoom'], 5, min, 12, max, 16, max * 1.6]);

const parts: VtPart[] = [
  { id: 'wasserstrasse', sourceLayer: 'pressurised_waterway', kind: 'line', color: RESERVOIR, size: lineW(1.2), casing: true, minZoom: 4 },
  { id: 'leitung', sourceLayer: 'water_pipeline', kind: 'line', filter: flt(['!', buried]), color: pipeColor, size: lineW(1), minZoom: 5 },
  { id: 'leitung-erde', sourceLayer: 'water_pipeline', kind: 'line', filter: flt(buried), color: pipeColor, size: lineW(1), dash: [2, 1.4], minZoom: 5 },
  { id: 'speicher-flaeche', sourceLayer: 'water_reservoir', kind: 'fill', color: RESERVOIR, minZoom: 6 },
  { id: 'speicher', sourceLayer: 'water_reservoir_point', kind: 'circle', color: RESERVOIR, size: dot(2, 4), minZoom: 7 },
  { id: 'wasserwerk', sourceLayer: 'water_treatment_plant_point', kind: 'circle', color: TREAT, size: dot(2.4, 5), minZoom: 6 },
  { id: 'klaerwerk', sourceLayer: 'wastewater_plant_point', kind: 'circle', color: WASTE, size: dot(2.4, 5), minZoom: 6 },
  { id: 'pumpwerk', sourceLayer: 'pumping_station_point', kind: 'circle', color: PUMP, size: dot(1.8, 3.6), minZoom: 9 },
];

const SUBSTANCE: Record<string, string> = { water: 'Wasser', hot_water: 'Heißwasser', steam: 'Dampf', sewage: 'Abwasser', wastewater: 'Abwasser', waterwaste: 'Abwasser', rainwater: 'Regenwasser', drain: 'Entwässerung' };
const USAGE: Record<string, string> = { distribution: 'Verteilleitung', transmission: 'Fernleitung', transportation: 'Transportleitung', facility: 'Anlagenleitung', penstock: 'Druckrohrleitung' };
const KIND: Record<string, { title: string; icon: 'drop' | 'wave'; color: string }> = {
  wasserstrasse: { title: 'Druckstollen', icon: 'wave', color: RESERVOIR }, 'speicher-flaeche': { title: 'Wasserspeicher', icon: 'drop', color: RESERVOIR }, speicher: { title: 'Wasserspeicher', icon: 'drop', color: RESERVOIR },
  wasserwerk: { title: 'Wasserwerk', icon: 'drop', color: TREAT }, klaerwerk: { title: 'Kläranlage', icon: 'drop', color: WASTE }, pumpwerk: { title: 'Pumpwerk', icon: 'drop', color: PUMP },
};

export default defineLayer({
  id: 'wassernetz',
  category: 'infrastruktur',
  title: 'Wasserversorgung',
  summary: 'Wasser- und Abwasserleitungen, Wasserwerke, Kläranlagen, Speicher und Pumpwerke aus OpenStreetMap',
  icon: 'drop',
  color: COLOR,
  form: 'lines',
  cadence: 'daily',
  minZoom: 5,
  sources: [OIM_SOURCE],
  legend: {
    type: 'classes',
    items: [
      { color: WATER, label: 'Wasserleitung', shape: 'line' }, { color: SEWAGE, label: 'Abwasser, Regenwasser', shape: 'line' }, { color: HOT, label: 'Heißwasser, Dampf', shape: 'line' },
      { color: RESERVOIR, label: 'Speicher, Druckstollen' }, { color: TREAT, label: 'Wasserwerk' }, { color: WASTE, label: 'Kläranlage' }, { color: PUMP, label: 'Pumpwerk' },
    ],
  },
  keywords: ['wasser', 'wasserwerk', 'kläranlage', 'abwasser', 'wasserleitung', 'stausee', 'speicher', 'pumpwerk', 'trinkwasser', 'water', 'sewage', 'reservoir', 'openinframap'],

  mount(ctx) {
    return vectorTileLayer(ctx, {
      tiles: oimTiles('water'),
      attribution: OIM_ATTRIBUTION,
      parts,
      describe(f: AnyFeature, part) {
        const p = f.properties as Record<string, unknown>;
        const operator = str(p.operator);
        const links = [{ label: 'OpenStreetMap', url: osmUrl(p) }, ...(str(p.wikipedia) ? [{ label: 'Wikipedia', url: `https://${str(p.wikipedia).split(':')[0]}.wikipedia.org/wiki/${encodeURIComponent(str(p.wikipedia).split(':').slice(1).join(':'))}` }] : [])];
        const since = str(p.start_date) ? [{ label: 'In Betrieb seit', value: str(p.start_date) }] : [];
        if (part.id === 'leitung' || part.id === 'leitung-erde') {
          const sub = SUBSTANCE[str(p.substance)] ?? 'Wasser';
          const dia = diameterLabel(p.diameter);
          return {
            title: str(p.name) || `${sub}leitung`, subtitle: `Leitung · ${sub}`, icon: 'drop', color: sub === 'Wasser' ? WATER : undefined,
            facts: [{ label: 'Stoff', value: sub, emphasis: true }, ...(dia ? [{ label: 'Durchmesser', value: dia }] : []), ...(USAGE[str(p.usage)] ? [{ label: 'Art', value: USAGE[str(p.usage)]! }] : []), ...(operator ? [{ label: 'Betreiber', value: operator }] : []), ...since],
            links,
          };
        }
        const k = KIND[part.id]!;
        const sub = SUBSTANCE[str(p.substance)];
        return {
          title: str(p.name) || k.title, subtitle: k.title, icon: k.icon, color: k.color,
          facts: [...(sub ? [{ label: 'Stoff', value: sub }] : []), ...(operator ? [{ label: 'Betreiber', value: operator }] : []), ...(str(p.ref) ? [{ label: 'Kennung', value: str(p.ref) }] : []), ...since],
          links,
        };
      },
    });
  },
});
