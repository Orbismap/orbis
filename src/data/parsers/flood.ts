// Open-Meteo Flood (GloFAS) multi-location response -> one record per river station.
// A station is probed with several neighbouring points (the model grid is 0.05°, a coordinate on the Natural Earth
// river line often falls on a neighbouring cell without the main channel); the parser keeps the probe with the
// highest discharge today.

export interface FloodStation {
  /** model cell that won, degrees */
  lat: number;
  lon: number;
  /** discharge in m³/s, day 0 = today (UTC), up to 30 days ahead; NaN dropped to null */
  q: (number | null)[];
  /** long-term median for the same days */
  med: (number | null)[];
  /** time of day 0, ms */
  t0: number;
}

interface Row { latitude?: number; longitude?: number; daily?: { time?: string[]; river_discharge?: (number | null)[]; river_discharge_median?: (number | null)[] } }

export interface FloodArgs {
  /** probes per station (consecutive rows) */
  group?: number;
  /** "YYYY-MM-DD" of day 0, default today UTC */
  today?: string;
}

const r2 = (x: number | null | undefined): number | null => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

export function floodStations(raw: unknown, args: FloodArgs = {}): (FloodStation | null)[] {
  const rows: Row[] = Array.isArray(raw) ? (raw as Row[]) : raw && typeof raw === 'object' ? [raw as Row] : [];
  const group = Math.max(1, args.group ?? 1);
  const today = args.today ?? new Date().toISOString().slice(0, 10);
  const out: (FloodStation | null)[] = [];
  for (let s = 0; s < rows.length; s += group) {
    let best: FloodStation | null = null;
    for (const r of rows.slice(s, s + group)) {
      const d = r.daily;
      if (!d?.time || !d.river_discharge) continue;
      const i0 = Math.max(0, d.time.indexOf(today));
      const q = d.river_discharge.slice(i0, i0 + 30).map(r2);
      if (q[0] == null) continue;
      if (best && best.q[0]! >= q[0]) continue;
      best = {
        lat: r.latitude ?? NaN,
        lon: r.longitude ?? NaN,
        q,
        med: (d.river_discharge_median ?? []).slice(i0, i0 + 30).map(r2),
        t0: Date.parse(`${d.time[i0] ?? today}T00:00:00Z`),
      };
    }
    out.push(best);
  }
  return out;
}

// ---- derived values ----------------------------------------------------------------------------

export type Trend = 'rising' | 'falling' | 'stable';

export interface RiverStatus {
  now: number;
  /** long-term median of today, undefined when unknown */
  median?: number;
  /** now ÷ median */
  ratio?: number;
  /** relative change from today to day 7 (0.2 = +20 %) */
  change7: number;
  trend: Trend;
  /** the next 8 days (today … +7) */
  spark: number[];
  max30: number;
  /** day index of the 30-day maximum */
  max30Day: number;
}

/** ≥ 10 % up or down within a week counts as a trend. */
export const TREND_LIMIT = 0.1;

export function riverStatus(st: Pick<FloodStation, 'q' | 'med'>): RiverStatus | null {
  const q = st.q.map((x) => x ?? NaN);
  const now = q[0];
  if (now === undefined || !Number.isFinite(now)) return null;
  const spark = q.slice(0, 8).filter((x) => Number.isFinite(x));
  const end = spark[spark.length - 1] ?? now;
  const change7 = now > 0.05 ? (end - now) / now : 0;
  let max30 = now;
  let max30Day = 0;
  q.forEach((x, i) => { if (Number.isFinite(x) && x > max30) { max30 = x; max30Day = i; } });
  const med = st.med[0];
  const median = med != null && med > 0.05 ? med : undefined;
  return {
    now, median, ratio: median ? now / median : undefined, change7,
    trend: change7 > TREND_LIMIT ? 'rising' : change7 < -TREND_LIMIT ? 'falling' : 'stable',
    spark, max30, max30Day,
  };
}

const BARS = '▁▂▃▄▅▆▇█';
/** Unicode sparkline of a series (scaled between its own min and max). */
export function sparkline(values: readonly number[]): string {
  if (!values.length) return '';
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi - lo < 1e-9) return BARS[3]!.repeat(values.length);
  return values.map((v) => BARS[Math.round(((v - lo) / (hi - lo)) * (BARS.length - 1))]!).join('');
}
