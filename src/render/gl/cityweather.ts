// Pure helpers of the city weather layer: condition glyph from model values, daylight, daily outlook from ICON grids.
import type { OwxField } from '../../data/owx/decode';
import { bracketTime, sampleGrid } from './grid';

export type Cond = 'clear' | 'clear-night' | 'partly' | 'partly-night' | 'cloud' | 'rain' | 'snow';

export const CONDITION_DE: Record<Cond, string> = {
  clear: 'Sonnig', 'clear-night': 'Klar', partly: 'Wolkig', 'partly-night': 'Wolkig', cloud: 'Bedeckt', rain: 'Regen', snow: 'Schnee',
};

/** Condition from cloud cover (%), precipitation (mm/h), temperature (°C) and daylight. */
export function conditionOf(cloud: number, precip: number, t: number, day: boolean): Cond {
  if (precip >= 0.1) return t <= 0.5 ? 'snow' : 'rain';
  if (cloud < 20) return day ? 'clear' : 'clear-night';
  if (cloud < 60) return day ? 'partly' : 'partly-night';
  return 'cloud';
}

/** True while the sun is above the horizon (simple solar position, ±0.5° is plenty for a glyph). */
export function isDaylight(lng: number, lat: number, at: number): boolean {
  const d = new Date(at);
  const doy = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + lng / 15;
  const ha = (hours - 12) * 15;
  const r = Math.PI / 180;
  const sinAlt = Math.sin(lat * r) * Math.sin(decl * r) + Math.cos(lat * r) * Math.cos(decl * r) * Math.cos(ha * r);
  return sinAlt > -0.0145; // sun's upper limb on the horizon (-0.83°)
}

export interface CityFields { t: OwxField; cloud: OwxField; precip: OwxField; u: OwxField; v: OwxField }
export interface CityNow { t: number; cloud: number; precip: number; wind: number }

export function sampleCity(f: CityFields, times: readonly number[], at: number, lng: number, lat: number): CityNow | undefined {
  const br = bracketTime(times, at);
  const t = sampleGrid(f.t, br, lng, lat);
  if (t === undefined) return undefined;
  const u = sampleGrid(f.u, br, lng, lat) ?? 0;
  const v = sampleGrid(f.v, br, lng, lat) ?? 0;
  return { t, cloud: sampleGrid(f.cloud, br, lng, lat) ?? 0, precip: sampleGrid(f.precip, br, lng, lat) ?? 0, wind: Math.hypot(u, v) * 3.6 };
}

export interface DayOutlook { day: number; min: number; max: number; wind: number; precip: number; cond: Cond }

/**
 * Daily outlook (UTC days shifted to local solar time by longitude) from `from` on: min/max temperature, strongest
 * wind (km/h), precipitation total (mm, hourly rate × 3 h per model step) and the dominant daytime condition.
 */
export function cityOutlook(f: CityFields, times: readonly number[], from: number, lng: number, lat: number, days = 3): DayOutlook[] {
  const shift = Math.round(lng / 15) * 3_600_000;
  const dayOf = (t: number) => Math.floor((t + shift) / 86_400_000);
  const start = dayOf(from);
  const acc = new Map<number, { min: number; max: number; wind: number; precip: number; cloudDay: number[]; precDay: number }>();
  for (const t of times) {
    const d = dayOf(t);
    if (d < start || d >= start + days) continue;
    const s = sampleCity(f, times, t, lng, lat);
    if (!s) continue;
    const a = acc.get(d) ?? { min: Infinity, max: -Infinity, wind: 0, precip: 0, cloudDay: [], precDay: 0 };
    a.min = Math.min(a.min, s.t);
    a.max = Math.max(a.max, s.t);
    a.wind = Math.max(a.wind, s.wind);
    a.precip += s.precip * 3;
    if (isDaylight(lng, lat, t)) { a.cloudDay.push(s.cloud); a.precDay = Math.max(a.precDay, s.precip); }
    acc.set(d, a);
  }
  return [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([day, a]) => {
    const cloud = a.cloudDay.length ? a.cloudDay.reduce((x, y) => x + y, 0) / a.cloudDay.length : 50;
    return { day: day * 86_400_000 - shift, min: a.min, max: a.max, wind: a.wind, precip: a.precip, cond: conditionOf(cloud, a.precDay >= 0.1 ? a.precDay : 0, a.max, true) };
  });
}
