// NOAA NDBC latest_obs.txt (fixed-width, whitespace separated, "MM" = missing) -> buoy points.
import type { Feature, FeatureCollection, Point } from 'geojson';

export interface BuoyProps {
  id: string;
  /** observation time, ms */
  time: number;
  /** significant wave height, m */
  wvht?: number;
  /** dominant wave period, s */
  dpd?: number;
  /** wind speed / gust, m/s */
  wspd?: number;
  gst?: number;
  /** wind direction, degrees true (from) */
  wdir?: number;
  /** pressure hPa */
  pres?: number;
  /** air / water temperature, °C */
  atmp?: number;
  wtmp?: number;
}
export type BuoyCollection = FeatureCollection<Point, BuoyProps>;

const COLS = { wdir: 8, wspd: 9, gst: 10, wvht: 11, dpd: 12, pres: 15, atmp: 17, wtmp: 18 } as const;

export function ndbcBuoys(raw: unknown): BuoyCollection {
  const features: Feature<Point, BuoyProps>[] = [];
  const text = typeof raw === 'string' ? raw : '';
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const c = line.trim().split(/\s+/);
    if (c.length < 19) continue;
    const num = (i: number): number | undefined => {
      const s = c[i];
      if (s === undefined || s === 'MM') return undefined;
      const v = Number(s);
      return Number.isFinite(v) ? v : undefined;
    };
    const lat = num(1);
    const lng = num(2);
    if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const time = Date.UTC(+c[3]!, +c[4]! - 1, +c[5]!, +c[6]!, +c[7]!);
    if (!Number.isFinite(time)) continue;
    const p: BuoyProps = { id: c[0]!, time };
    for (const [k, i] of Object.entries(COLS)) {
      const v = num(i);
      if (v !== undefined) p[k as keyof typeof COLS] = v;
    }
    if (p.wvht === undefined && p.wspd === undefined && p.atmp === undefined && p.wtmp === undefined && p.pres === undefined) continue;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: p });
  }
  return { type: 'FeatureCollection', features };
}
