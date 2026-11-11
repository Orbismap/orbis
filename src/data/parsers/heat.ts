// heat/cctv.json rows [lon, lat, count] -> weighted points for a heatmap layer.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type HeatCollection = FeatureCollection<Point, { n: number }>;

export function heatCells(raw: unknown): HeatCollection {
  const features: Feature<Point, { n: number }>[] = [];
  if (Array.isArray(raw)) {
    for (const r of raw as number[][]) {
      if (!Number.isFinite(r[0]) || !Number.isFinite(r[1])) continue;
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [r[0]!, r[1]!] }, properties: { n: r[2] ?? 1 } });
    }
  }
  return { type: 'FeatureCollection', features };
}
