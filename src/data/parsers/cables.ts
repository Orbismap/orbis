// osm-cables/cables.json (GeoJSON LineStrings of submarine cables) -> slim lines.
import type { Feature, FeatureCollection, LineString } from 'geojson';

export type CableProps = { id: number | string; name: string; operator: string; since: string; color: string };
export type CableCollection = FeatureCollection<LineString, CableProps>;

export function cableLines(raw: unknown): CableCollection {
  const features: Feature<LineString, CableProps>[] = [];
  const list = (raw as { features?: Feature[] } | null)?.features;
  if (Array.isArray(list)) {
    for (const f of list) {
      if (f.geometry?.type !== 'LineString' || f.geometry.coordinates.length < 2) continue;
      const p = (f.properties ?? {}) as Partial<CableProps>;
      features.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          id: p.id ?? features.length,
          name: p.name || 'Unbenanntes Kabel',
          operator: p.operator ?? '',
          since: p.since ?? '',
          color: p.color || '#4fc3f7',
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
