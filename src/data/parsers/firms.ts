// NASA FIRMS snapshot (v2: { rows: [[lon, lat, frp MW, confidence, minutes since 1970 UTC], ...] }) -> slim hotspot points.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type FireProps = {
  /** fire radiative power in MW */
  frp: number;
  /** 1 nominal, 2 high confidence */
  c: 1 | 2;
  /** detection time, minutes since 1970 UTC */
  t: number;
};
export type FireCollection = FeatureCollection<Point, FireProps>;

/** 'l' | 'n' | 'h' (VIIRS) or 0..100 (MODIS) -> 0 low, 1 nominal, 2 high. */
export function fireConfidence(c: unknown): 0 | 1 | 2 {
  if (c === 'h') return 2;
  if (c === 'n') return 1;
  if (c === 'l') return 0;
  const n = Number(c);
  if (!Number.isFinite(n)) return 0;
  return n >= 80 ? 2 : n >= 30 ? 1 : 0;
}

/** Low-confidence detections are dropped (mostly noise: gas flares, sun glint, industry). */
export function firmsFires(raw: unknown): FireCollection {
  const features: Feature<Point, FireProps>[] = [];
  const rows = (raw as { rows?: unknown[][] } | null)?.rows;
  if (!Array.isArray(rows)) return { type: 'FeatureCollection', features };
  for (const r of rows) {
    const lon = Number(r[0]);
    const lat = Number(r[1]);
    const t = Number(r[4]);
    const c = fireConfidence(r[3]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(t) || c === 0) continue;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { frp: Number(r[2]) || 0, c, t } });
  }
  return { type: 'FeatureCollection', features };
}
