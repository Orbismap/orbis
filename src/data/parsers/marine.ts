// Open-Meteo Marine multi-location response (current wave values) -> wave points; land points (null) are dropped.
import type { Feature, FeatureCollection, Point } from 'geojson';

export interface WaveProps {
  id: string;
  /** significant wave height, m */
  h: number;
  /** wave period, s */
  t?: number;
  /** direction the waves come from, degrees */
  dir?: number;
  /** model time, ms */
  time: number;
}
export type WaveCollection = FeatureCollection<Point, WaveProps>;

interface Row { latitude?: number; longitude?: number; current?: { time?: string; wave_height?: number | null; wave_period?: number | null; wave_direction?: number | null } }

export function marineWaves(raw: unknown): WaveCollection {
  const rows: Row[] = Array.isArray(raw) ? (raw as Row[]) : raw && typeof raw === 'object' ? [raw as Row] : [];
  const features: Feature<Point, WaveProps>[] = [];
  for (const r of rows) {
    const c = r.current;
    if (!c || typeof c.wave_height !== 'number' || typeof r.latitude !== 'number' || typeof r.longitude !== 'number') continue;
    const time = Date.parse(`${c.time ?? ''}Z`);
    const p: WaveProps = { id: `${r.latitude.toFixed(1)},${r.longitude.toFixed(1)}`, h: c.wave_height, time: Number.isFinite(time) ? time : Date.now() };
    if (typeof c.wave_period === 'number') p.t = c.wave_period;
    if (typeof c.wave_direction === 'number') p.dir = c.wave_direction;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] }, properties: p });
  }
  return { type: 'FeatureCollection', features };
}
