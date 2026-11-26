// assets.json of the 3D landmarks (all of them, ~10 MB) -> slim points for the layer "Landmarks". Which entries count
// (anchor, model, CC0) is decided by `parseLandmarks`, so the points are exactly the models the map can draw.
import type { Feature, FeatureCollection, Point } from 'geojson';
import { parseLandmarks } from '../landmarks';

/** The groups of the layer (filter, colour, legend) and the dataset's `type`s in each; whatever is unknown is "other". */
export const LANDMARK_GROUPS = [
  { id: 'gebaeude', label: 'Gebäude', color: '#E8C27A', types: ['building'] },
  { id: 'turm', label: 'Türme', color: '#FF8A65', types: ['tower'] },
  { id: 'stadion', label: 'Stadien', color: '#6FD3C8', types: ['stadium'] },
  { id: 'bruecke', label: 'Brücken und Bauwerke', color: '#8F9BFF', types: ['bridge', 'infrastructure'] },
  { id: 'denkmal', label: 'Denkmäler, Skulpturen, Brunnen', color: '#E887C4', types: ['monument', 'sculpture', 'fountain'] },
  { id: 'fahrt', label: 'Fahrgeschäfte', color: '#9BDB6B', types: ['coaster', 'ride'] },
  { id: 'sonstiges', label: 'Sonstiges', color: '#B8C2D1', types: [] as string[] },
] as const;
export type LandmarkGroup = (typeof LANDMARK_GROUPS)[number]['id'];

/** German name of a `type` of the dataset. */
const KINDS: Record<string, string> = {
  building: 'Gebäude', tower: 'Turm', stadium: 'Stadion', bridge: 'Brücke', infrastructure: 'Bauwerk', monument: 'Denkmal',
  sculpture: 'Skulptur', fountain: 'Brunnen', coaster: 'Achterbahn', ride: 'Fahrgeschäft', landscape: 'Landschaft',
};

export type LandmarkPointProps = {
  id: string; name: string; group: LandmarkGroup; kind: string; place: string; heightM: number;
  /** [west, south, east, north] of the model, as "w,s,e,n" (GeoJSON sources flatten arrays) */
  bounds: string;
  description: string; osm: string; wikidata: string;
};
export type LandmarkPointCollection = FeatureCollection<Point, LandmarkPointProps>;

interface Extra { id?: string; type?: string; place?: { name?: string }; description?: string; osm?: { url?: string } | null; wikidata?: string }

export function landmarkPoints(raw: unknown): LandmarkPointCollection {
  const samples = new Map(parseLandmarks(raw).map((l) => [l.id, l]));
  const features: Feature<Point, LandmarkPointProps>[] = [];
  for (const a of samples.size ? (raw as { assets: Extra[] }).assets : []) {
    const l = samples.get(a.id ?? '');
    if (!l) continue;
    samples.delete(l.id); // an id listed twice gives one point
    const type = a.type ?? '';
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
      properties: {
        id: l.id,
        name: l.name,
        group: LANDMARK_GROUPS.find((g) => (g.types as readonly string[]).includes(type))?.id ?? 'sonstiges',
        kind: KINDS[type] ?? 'Wahrzeichen',
        place: a.place?.name ?? '',
        heightM: l.heightM,
        bounds: l.bounds.join(','),
        description: a.description ?? '',
        osm: a.osm?.url ?? '',
        wikidata: a.wikidata ?? '',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
