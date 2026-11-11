// osm-datacenters/datacenters.json (GeoJSON, OSM) -> slim points.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type DatacenterProps = { id: string; name: string; operator: string; city: string };
export type DatacenterCollection = FeatureCollection<Point, DatacenterProps>;

export function dataCenters(raw: unknown): DatacenterCollection {
  const features: Feature<Point, DatacenterProps>[] = [];
  const list = (raw as { features?: Feature[] } | null)?.features;
  if (Array.isArray(list)) {
    for (const f of list) {
      if (f.geometry?.type !== 'Point') continue;
      const p = (f.properties ?? {}) as Record<string, unknown>;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.geometry.coordinates[0]!, f.geometry.coordinates[1]!] },
        properties: { id: String(p.osm ?? features.length), name: String(p.name ?? ''), operator: String(p.operator ?? ''), city: String(p.city ?? '') },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
