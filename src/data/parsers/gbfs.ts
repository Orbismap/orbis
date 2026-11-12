// GBFS (General Bikeshare Feed Specification): station_information + station_status of one system -> station points.
// GBFS 3 has localised name lists, GBFS 2 plain strings.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type BikeStationProps = {
  id: string; name: string; sys: string; bikes: number; ebikes: number; docks: number; capacity: number; off: boolean; updated: number;
};

interface Info { station_id: string; name?: string | { text: string }[]; lat: number; lon: number; capacity?: number }
interface Status {
  station_id: string; num_bikes_available?: number; num_ebikes_available?: number; num_docks_available?: number;
  is_installed?: boolean | number; is_renting?: boolean | number; last_reported?: number | string;
}

const text = (v: Info['name']) => (Array.isArray(v) ? (v[0]?.text ?? '') : (v ?? ''));
const flagOff = (v: unknown) => v === false || v === 0;

/** `raw`: `{ info, status, sys, sysId }` with the two parsed feed documents. -1 marks a number the operator does not report. */
export function gbfsStations(raw: { info: unknown; status: unknown; sys: string; sysId: string }): FeatureCollection<Point, BikeStationProps> {
  const stations = ((raw.info as { data?: { stations?: Info[] } } | null)?.data?.stations ?? []) as Info[];
  const status = ((raw.status as { data?: { stations?: Status[] } } | null)?.data?.stations ?? []) as Status[];
  const byId = new Map(status.map((s) => [String(s.station_id), s]));
  const features: Feature<Point, BikeStationProps>[] = [];
  for (const s of stations) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon) || (s.lat === 0 && s.lon === 0)) continue;
    const st = byId.get(String(s.station_id));
    const rep = st?.last_reported;
    const updated = rep == null ? 0 : typeof rep === 'number' ? (rep > 946_684_800 ? rep * 1000 : 0) : Date.parse(rep) || 0;
    features.push({
      type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: {
        id: `${raw.sysId}:${s.station_id}`, name: text(s.name) || 'Station', sys: raw.sys, bikes: st?.num_bikes_available ?? 0,
        ebikes: st?.num_ebikes_available ?? -1, docks: st?.num_docks_available ?? -1, capacity: s.capacity ?? -1,
        off: !st || flagOff(st.is_installed) || flagOff(st.is_renting), updated,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
