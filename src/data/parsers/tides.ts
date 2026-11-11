// NOAA CO-OPS station list (mdapi stations.json?type=waterlevels) -> tide gauge points.
import type { Feature, FeatureCollection, Point } from 'geojson';

export interface TideStationProps { id: string; name: string; state: string }
export type TideStationCollection = FeatureCollection<Point, TideStationProps>;

export function coopsStations(raw: unknown): TideStationCollection {
  const features: Feature<Point, TideStationProps>[] = [];
  const list = (raw as { stations?: { id?: string; name?: string; state?: string; lat?: number; lng?: number }[] } | null)?.stations;
  if (Array.isArray(list)) {
    for (const s of list) {
      if (!s.id || typeof s.lat !== 'number' || typeof s.lng !== 'number' || Math.abs(s.lat) > 90 || Math.abs(s.lng) > 180) continue;
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lng, s.lat] }, properties: { id: String(s.id), name: s.name ?? `Station ${s.id}`, state: s.state ?? '' } });
    }
  }
  return { type: 'FeatureCollection', features };
}
