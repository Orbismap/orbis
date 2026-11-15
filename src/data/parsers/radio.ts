// radio/top.json and radio/cells/<lat>_<lon>.json (Radio Browser station records) -> slim points.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type StationProps = {
  id: string; name: string; /** https stream URL, '' when the station only has an insecure (http) one */ stream: string; streamHttp: string;
  homepage: string; tags: string; country: string; state: string; language: string; codec: string; bitrate: number; hls: boolean; clicks: number;
  /** station logo, '' when none is given or it is only served over http */
  favicon: string;
};
export type StationCollection = FeatureCollection<Point, StationProps>;

interface Rb {
  stationuuid?: string; name?: string; url_resolved?: string; homepage?: string; tags?: string; country?: string; state?: string; language?: string;
  codec?: string; bitrate?: number; hls?: number; geo_lat?: number | null; geo_long?: number | null; clickcount?: number; lastcheckok?: number; favicon?: string;
}

export function radioStations(raw: unknown): StationCollection {
  const features: Feature<Point, StationProps>[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const s of raw as Rb[]) {
      if (!s.stationuuid || s.geo_lat == null || s.geo_long == null || seen.has(s.stationuuid) || s.lastcheckok === 0) continue;
      if (!Number.isFinite(s.geo_lat) || !Number.isFinite(s.geo_long)) continue;
      seen.add(s.stationuuid);
      const url = s.url_resolved ?? '';
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.geo_long, s.geo_lat] },
        properties: {
          id: s.stationuuid,
          name: (s.name ?? '').trim() || 'Radiosender',
          stream: url.startsWith('https://') ? url : '',
          streamHttp: url.startsWith('http://') ? url : '',
          homepage: /^https?:\/\//.test(s.homepage ?? '') ? s.homepage! : '',
          tags: (s.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 4).join(', '),
          country: s.country ?? '',
          state: s.state ?? '',
          language: s.language ?? '',
          codec: s.codec ?? '',
          bitrate: s.bitrate ?? 0,
          hls: s.hls === 1,
          clicks: s.clickcount ?? 0,
          favicon: /^https:\/\//.test(s.favicon ?? '') ? s.favicon! : '',
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
