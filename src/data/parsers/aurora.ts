// NOAA SWPC OVATION aurora nowcast ([lon 0..359, lat -90..90, probability %]) -> 360 x 181 grid of probabilities.
export const AURORA_W = 360;
export const AURORA_H = 181;

export type AuroraGrid = {
  w: number;
  h: number;
  /** row 0 = lat -90, column 0 = lon 0 (index = (lat + 90) * 360 + lon); percent 0..100 */
  probs: Uint8Array;
  /** observation / forecast time, ms since epoch (0 = unknown) */
  obs: number;
  forecast: number;
  /** highest probability in the grid */
  max: number;
};

export function auroraGrid(raw: unknown): AuroraGrid {
  const r = raw as { 'Observation Time'?: string; 'Forecast Time'?: string; coordinates?: number[][] } | null;
  const probs = new Uint8Array(AURORA_W * AURORA_H);
  let max = 0;
  for (const c of r?.coordinates ?? []) {
    const lon = Math.round(Number(c[0]));
    const lat = Math.round(Number(c[1]));
    const v = Math.max(0, Math.min(100, Math.round(Number(c[2]))));
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(v) || lat < -90 || lat > 90) continue;
    probs[(lat + 90) * AURORA_W + (((lon % 360) + 360) % 360)] = v;
    if (v > max) max = v;
  }
  const t = (s: unknown) => (typeof s === 'string' ? Date.parse(s) || 0 : 0);
  return { w: AURORA_W, h: AURORA_H, probs, obs: t(r?.['Observation Time']), forecast: t(r?.['Forecast Time']), max };
}

/** Latest planetary Kp from noaa-planetary-k-index.json (array of objects). */
export function latestKp(raw: unknown): { kp: number; time: number } | undefined {
  const rows = Array.isArray(raw) ? (raw as { time_tag?: string; Kp?: number | string }[]) : [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const kp = Number(rows[i]?.Kp);
    const time = Date.parse(`${rows[i]?.time_tag ?? ''}Z`);
    if (Number.isFinite(kp) && Number.isFinite(time)) return { kp, time };
  }
  return undefined;
}
