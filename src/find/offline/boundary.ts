// The outline of a city, from Nominatim (OpenStreetMap). Its usage policy forbids search-as-you-type: ask only when the
// person sends the search.
import { boxOf, type Polygon, type Shape } from './area';

const SERVICE = (import.meta.env.VITE_FIND_CITY_URL as string | undefined) ?? 'https://nominatim.openstreetmap.org/search';

export interface City { id: string; name: string; detail: string; shape: Extract<Shape, { type: 'outline' }> }

interface Hit {
  osm_type?: string;
  osm_id?: number;
  name?: string;
  display_name?: string;
  geojson?: { type: string; coordinates: unknown };
}

export function citiesIn(hits: Hit[]): City[] {
  return hits.flatMap((hit): City[] => {
    const g = hit.geojson;
    const polygons = g?.type === 'Polygon' ? [g.coordinates as Polygon] : g?.type === 'MultiPolygon' ? (g.coordinates as Polygon[]) : null;
    // a point or a line has no area to download
    if (!polygons) return [];
    const [first = '', ...rest] = (hit.display_name ?? '').split(',').map((s) => s.trim());
    return [{ id: `${hit.osm_type}${hit.osm_id}`, name: hit.name || first, detail: rest.join(', '), shape: { type: 'outline', box: boxOf(polygons), polygons } }];
  });
}

export async function searchCities(query: string, signal: AbortSignal): Promise<City[]> {
  // the threshold thins the outline to about 100 m, plenty for choosing tiles of 1.5 km
  const url = `${SERVICE}?format=jsonv2&polygon_geojson=1&polygon_threshold=0.001&featureType=settlement&limit=5&accept-language=de&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
  if (!res.ok) throw new Error(`Nominatim: ${res.status}`);
  return citiesIn((await res.json()) as Hit[]);
}
