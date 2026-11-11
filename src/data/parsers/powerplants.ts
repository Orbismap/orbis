// wri/powerplants.json rows [lon, lat, MW, fuel, name, country, year, owner, url] -> slim points with a fuel class.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type FuelClass = 'wind' | 'solar' | 'hydro' | 'nuclear' | 'coal' | 'gas' | 'oil' | 'biomass' | 'other';

/**
 * Fixed categorical palette (Okabe-Ito based, tuned for the dark basemap; colour-blind safe: the pairs that are
 * easy to confuse, green/orange and blue/purple, also differ in lightness).
 */
export const FUELS: Record<FuelClass, { label: string; color: string }> = {
  wind: { label: 'Wind', color: '#2BC48A' },
  solar: { label: 'Solar', color: '#F5E642' },
  hydro: { label: 'Wasser', color: '#3E8BFF' },
  nuclear: { label: 'Kern', color: '#D98BFF' },
  coal: { label: 'Kohle', color: '#C9CED6' },
  gas: { label: 'Gas', color: '#F29B1D' },
  oil: { label: 'Öl', color: '#E5533D' },
  biomass: { label: 'Biomasse', color: '#B98A5A' },
  other: { label: 'Sonstige', color: '#7C8697' },
};
export const FUEL_ORDER = Object.keys(FUELS) as FuelClass[];

const FUEL_MAP: Record<string, FuelClass> = {
  Wind: 'wind', Solar: 'solar', Hydro: 'hydro', Nuclear: 'nuclear', Coal: 'coal', Petcoke: 'coal',
  Gas: 'gas', Cogeneration: 'gas', Oil: 'oil', Biomass: 'biomass', Waste: 'biomass',
};

export type PlantProps = { id: number; name: string; fuel: FuelClass; fuelRaw: string; mw: number; country: string; year: number; owner: string; url: string };
export type PlantCollection = FeatureCollection<Point, PlantProps>;

export function powerPlants(raw: unknown): PlantCollection {
  const features: Feature<Point, PlantProps>[] = [];
  if (Array.isArray(raw)) {
    for (const r of raw as unknown[][]) {
      const [lon, lat, mw, fuel, name, country, year, owner, url] = r as [number, number, number, string, string, string, number, string, string];
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || !(mw > 0)) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          id: features.length,
          name: name || 'Kraftwerk',
          fuel: FUEL_MAP[fuel] ?? 'other',
          fuelRaw: fuel ?? '',
          mw,
          country: country ?? '',
          year: year > 1800 ? year : 0,
          owner: owner ?? '',
          url: typeof url === 'string' && /^https?:\/\//.test(url) ? url : '',
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
