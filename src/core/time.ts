// Time constants and rounding helpers (all values are ms since epoch).
export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

export function roundTo(t: number, step: number, mode: 'nearest' | 'floor' | 'ceil' = 'nearest'): number {
  const q = t / step;
  return (mode === 'floor' ? Math.floor(q) : mode === 'ceil' ? Math.ceil(q) : Math.round(q)) * step;
}

/** Start of the day containing `t`, in local time or UTC. */
export function startOfDay(t: number, utc = false): number {
  const d = new Date(t);
  return utc ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** All midnights inside (start, end], in local time or UTC. */
export function dayBoundaries(start: number, end: number, utc = false): number[] {
  const out: number[] = [];
  const d = new Date(startOfDay(start, utc));
  for (;;) {
    if (utc) d.setUTCDate(d.getUTCDate() + 1);
    else d.setDate(d.getDate() + 1);
    const t = d.getTime();
    if (t > end) break;
    if (t > start) out.push(t);
  }
  return out;
}

export const clampTime = (t: number, start: number, end: number) => Math.min(end, Math.max(start, t));
export const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10);
export const yesterdayIso = (now = Date.now()) => isoDate(now - DAY);
