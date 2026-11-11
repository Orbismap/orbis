// wikidata/resources.json rows [lon, lat, Q-id, name, class, products] -> slim points with a commodity group.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type ResourceGroup = 'oilgas' | 'coal' | 'metal' | 'uranium' | 'salt' | 'gem' | 'other';

export const RESOURCE_GROUPS: Record<ResourceGroup, { label: string; color: string }> = {
  oilgas: { label: 'Öl & Gas', color: '#E5533D' },
  coal: { label: 'Kohle', color: '#C9CED6' },
  metal: { label: 'Metalle', color: '#F29B1D' },
  uranium: { label: 'Uran', color: '#B6F23A' },
  salt: { label: 'Salz & Kali', color: '#5CC8FF' },
  gem: { label: 'Edelsteine', color: '#D98BFF' },
  other: { label: 'Sonstige / unbekannt', color: '#8A93A3' },
};
export const RESOURCE_ORDER = Object.keys(RESOURCE_GROUPS) as ResourceGroup[];

const GERMAN: [RegExp, string][] = [
  [/coal|lignite|coke|anthracite/, 'Kohle'], [/gold/, 'Gold'], [/silver/, 'Silber'], [/copper/, 'Kupfer'], [/iron/, 'Eisen'],
  [/uranium/, 'Uran'], [/lead/, 'Blei'], [/zinc/, 'Zink'], [/diamond/, 'Diamanten'], [/nickel/, 'Nickel'], [/tin ore/, 'Zinn'],
  [/salt|potash/, 'Salz & Kali'], [/lithium/, 'Lithium'], [/bauxite/, 'Bauxit'], [/petroleum|oil/, 'Erdöl'], [/natural gas/, 'Erdgas'],
];

/** Commodity group from the Wikidata class and the free-text product list. */
export function resourceGroup(cls: string, products: string): ResourceGroup {
  const p = products.toLowerCase();
  if (cls === 'Ölfeld' || /petroleum|natural gas|crude/.test(p)) return 'oilgas';
  if (/uranium/.test(p)) return 'uranium';
  if (/coal|lignite|coke|anthracite/.test(p)) return 'coal';
  if (/salt|potash|halite|sodium chloride/.test(p) || cls === 'Salzbergwerk') return 'salt';
  if (/diamond|emerald|sapphire|ruby|gem|opal|amber|jade/.test(p)) return 'gem';
  if (/ore|gold|silver|copper|chromium|mercury|tantalum|graphite|magnesium|bauxite|lithium|platinum|manganese|tungsten|niobium|iron/.test(p)) return 'metal';
  return 'other';
}

export type ResourceProps = { id: string; name: string; group: ResourceGroup; cls: string; products: string };
export type ResourceCollection = FeatureCollection<Point, ResourceProps>;

export function wikiResources(raw: unknown): ResourceCollection {
  const features: Feature<Point, ResourceProps>[] = [];
  if (Array.isArray(raw)) {
    for (const r of raw as unknown[][]) {
      const [lon, lat, q, name, cls, products] = r as [number, number, string, string, string, string];
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const prod = products ?? '';
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { id: q, name: name || 'Vorkommen', group: resourceGroup(cls ?? '', prod), cls: cls ?? '', products: prod.split(',').map((s) => germanProduct(s.trim())).filter(Boolean).join(', ') },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function germanProduct(s: string): string {
  const l = s.toLowerCase();
  return GERMAN.find(([re]) => re.test(l))?.[1] ?? s;
}
