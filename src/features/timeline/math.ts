import { HOUR, MINUTE, DAY } from '../../core/time';

const full = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric' });
const dayMonthFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const hm = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const wdHm = new Intl.DateTimeFormat('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

const cleanup = (s: string) => s.replace(/^(\p{L}+)\.,\s*/u, '$1 ');

/** "Mi 11. Nov., 14:00" */
export function formatSelected(t: number): string {
  // Intl gives "Mi., 11. Nov., 14:00"
  return cleanup(full.format(t));
}

/** "Di 10." or "Di 10. Nov." for first-of-month and first label. */
export function formatDayLabel(t: number, withMonth: boolean): string {
  return cleanup((withMonth ? dayMonthFmt : dayFmt).format(t));
}

/** "Mi 14:00" for the handle label on small screens. */
export function formatShort(t: number): string {
  return cleanup(wdHm.format(t));
}

export const formatClock = (t: number) => hm.format(t);

/** "jetzt", "in 5 h", "vor 2 h", "in 3 Tg." relative to `now`. */
export function formatRelative(t: number, now: number): string {
  const d = t - now;
  const a = Math.abs(d);
  if (a < MINUTE) return 'jetzt';
  const sign = d > 0 ? 'in ' : 'vor ';
  if (a < 90 * MINUTE) return `${sign}${Math.round(a / MINUTE)} min`;
  if (a < 36 * HOUR) return `${sign}${Math.round(a / HOUR)} h`;
  return `${sign}${Math.round(a / DAY)} Tg.`;
}

/** Smallest hour step from the candidates whose labels are at least `minPx` apart; 0 = no hour labels. */
export function hourStep(pxPerHour: number, minPx = 30): number {
  for (const s of [1, 2, 3, 6, 12]) if (s * pxPerHour >= minPx) return s;
  return 0;
}
