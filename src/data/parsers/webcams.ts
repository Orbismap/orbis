// cams/<feed>.json (GeoJSON features with image/video/hls) and cams/world.json (positions only) -> slim points.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type WebcamProps = {
  id: string; title: string; subtitle: string; image: string; hls: string; video: string; url: string; source: string;
  /** viewing direction in degrees, -1 unknown */
  dir: number;
  /** 'road' = traffic/weather camera of an authority, 'signed' = link only (no live image) */
  kind: string;
};
export type WebcamCollection = FeatureCollection<Point, WebcamProps>;

/** Only https media can be shown in the app (http would be blocked as mixed content). */
const https = (u: unknown): string => (typeof u === 'string' && /^https:\/\//.test(u) ? u : '');
const web = (u: unknown): string => (typeof u === 'string' && /^https?:\/\//.test(u) ? u : '');

export function webcamFeed(raw: unknown): WebcamCollection {
  const features: Feature<Point, WebcamProps>[] = [];
  if (Array.isArray(raw)) {
    for (const f of raw as Feature[]) {
      if (f?.geometry?.type !== 'Point') continue;
      const [lon, lat] = f.geometry.coordinates;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const p = (f.properties ?? {}) as Record<string, unknown>;
      const dir = Number(p.dir);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon!, lat!] },
        properties: {
          id: String(p.id ?? features.length),
          title: String(p.title ?? 'Webcam'),
          subtitle: String(p.subtitle ?? ''),
          image: https(p.image),
          hls: https(p.hls),
          video: https(p.video),
          url: web(p.url) || web(p.image),
          source: String(p.source ?? ''),
          dir: p.dir != null && Number.isFinite(dir) ? dir : -1,
          kind: String(p.kind ?? 'road'),
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** world.json: [[lon, lat], …] overview of all camera positions. */
export function webcamPoints(raw: unknown): FeatureCollection<Point, Record<string, never>> {
  const features: Feature<Point, Record<string, never>>[] = [];
  if (Array.isArray(raw)) {
    for (const r of raw as number[][]) {
      if (Number.isFinite(r[0]) && Number.isFinite(r[1])) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [r[0]!, r[1]!] }, properties: {} });
    }
  }
  return { type: 'FeatureCollection', features };
}
