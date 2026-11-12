// Fair use of the keyless Open-Meteo APIs: 10 000 calls/day per IP (a location in a multi-location request counts
// as one call). The ocean layers keep a per-day counter in localStorage and stop refining at DAILY_LIMIT, leaving
// room for the other layers and tabs. Failed or rate-limited calls still count.
import { getJSON, setJSON } from '../../core/storage';

export const DAILY_LIMIT = 8000;
const KEY = 'ocean-budget';

interface Day { day: string; calls: number }
const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

export function spentToday(now = Date.now()): number {
  const d = getJSON<Day>(KEY, 1, (r) => (r && typeof (r as Day).calls === 'number' ? (r as Day) : undefined), { day: '', calls: 0 });
  return d.day === today(now) ? d.calls : 0;
}

export const canSpend = (n: number, limit = DAILY_LIMIT, now = Date.now()) => spentToday(now) + n <= limit;

export function spend(n: number, now = Date.now()): void {
  setJSON<Day>(KEY, 1, { day: today(now), calls: spentToday(now) + n });
}

// Open-Meteo also limits bursts: 600 calls/min and 5 000/h per IP. All ocean requests go through one queue that keeps
// to ~450 calls per minute (a request of n locations occupies the queue for n / 450 min after it starts).
const PER_MINUTE = 450;
let nextFree = 0;

/** Resolves when a request of `cost` calls may start; reserves the queue time for it. */
export async function pace(cost: number, signal?: AbortSignal): Promise<void> {
  const now = Date.now();
  const start = Math.max(now, nextFree);
  nextFree = start + (cost / PER_MINUTE) * 60_000;
  const wait = start - now;
  if (wait <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, wait);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
  });
}
