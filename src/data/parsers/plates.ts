// PB2002 plate boundaries (Bird 2003, GeoJSON by fraxen/tectonicplates) -> lines with plate names and type.
import type { Feature, FeatureCollection, LineString } from 'geojson';

export const PLATE_NAMES: Record<string, string> = {
  AF: 'Afrika', AM: 'Amur', AN: 'Antarktis', AP: 'Altiplano', AR: 'Arabien', AS: 'Ägäis', AT: 'Anatolien', AU: 'Australien',
  BH: 'Vogelkopf', BR: 'Balmoral Reef', BS: 'Banda-See', BU: 'Birma', CA: 'Karibik', CL: 'Karolinen', CO: 'Cocos',
  CR: 'Conway Reef', EA: 'Osterinsel', EU: 'Eurasien', FT: 'Futuna', GP: 'Galápagos', IN: 'Indien', JF: 'Juan de Fuca',
  JZ: 'Juan Fernández', KE: 'Kermadec', MA: 'Marianen', MN: 'Manus', MO: 'Maoke', MS: 'Molukken-See', NA: 'Nordamerika',
  NB: 'Nord-Bismarck', ND: 'Nord-Anden', NH: 'Neue Hebriden', NI: 'Niuafo’ou', NZ: 'Nazca', OK: 'Ochotsk', ON: 'Okinawa',
  PA: 'Pazifik', PM: 'Panama', PS: 'Philippinen', RI: 'Rivera', SA: 'Südamerika', SB: 'Süd-Bismarck', SC: 'Scotia',
  SL: 'Shetland', SO: 'Somalia', SS: 'Salomonen-See', SU: 'Sunda', SW: 'Sandwich', TI: 'Timor', TO: 'Tonga',
  WL: 'Woodlark', YA: 'Yangtze',
};

export type BoundaryType = 'subduction' | 'other';
export interface PlateBoundaryProps {
  id: string;
  code: string;
  a: string;
  b: string;
  /** German plate names */
  aName: string;
  bName: string;
  type: BoundaryType;
  source: string;
}
export type PlateCollection = FeatureCollection<LineString, PlateBoundaryProps>;

export function plateBoundaries(raw: unknown): PlateCollection {
  const features: Feature<LineString, PlateBoundaryProps>[] = [];
  const list = (raw as { features?: Feature[] } | null)?.features;
  if (Array.isArray(list)) {
    for (const f of list) {
      if (f.geometry?.type !== 'LineString' || f.geometry.coordinates.length < 2) continue;
      const p = (f.properties ?? {}) as Record<string, unknown>;
      const a = String(p.PlateA ?? '');
      const b = String(p.PlateB ?? '');
      features.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          id: `${String(p.Name ?? 'seg')}#${features.length}`,
          code: String(p.Name ?? ''),
          a, b,
          aName: PLATE_NAMES[a] ?? a,
          bName: PLATE_NAMES[b] ?? b,
          type: p.Type === 'subduction' ? 'subduction' : 'other',
          source: String(p.Source ?? ''),
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
