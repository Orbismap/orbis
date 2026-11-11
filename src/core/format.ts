// de-DE formatting. All user-visible numbers, dates and ages go through here.
export const NNBSP = ' ';

const nf = new Map<number, Intl.NumberFormat>();
function numberFormat(digits: number): Intl.NumberFormat {
  let f = nf.get(digits);
  if (!f) nf.set(digits, (f = new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })));
  return f;
}

export const formatNumber = (v: number, digits = 0) => numberFormat(digits).format(v);
export const formatInt = (v: number) => numberFormat(0).format(Math.round(v));

/** Number with unit, separated by a narrow no-break space: "12 km". */
export const withUnit = (text: string, unit: string) => `${text}${NNBSP}${unit}`;
export const formatWithUnit = (v: number, unit: string, digits = 0) => withUnit(formatNumber(v, digits), unit);

const compact = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });
/** 1.234 -> "1,2 Tsd.", 3.400.000 -> "3,4 Mio." */
export const formatCompact = (v: number) => (Math.abs(v) < 1000 ? formatInt(v) : compact.format(v));

const dateTimeFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dateTimeYearFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
const dateYearFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const timeUtcFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric' });

export const formatTime = (t: number, utc = false) => (utc ? `${timeUtcFmt.format(t)} UTC` : timeFmt.format(t));
export const formatDate = (t: number, now = Date.now()) =>
  (new Date(t).getFullYear() === new Date(now).getFullYear() ? dateFmt : dateYearFmt).format(t);
/** "9. Nov., 14:20" (with year when it is not the current one). */
export const formatDateTime = (t: number, now = Date.now()) =>
  (new Date(t).getFullYear() === new Date(now).getFullYear() ? dateTimeFmt : dateTimeYearFmt).format(t).replace(' um ', ', ');
/** "Di. 10." for timeline axes. */
export const formatWeekday = (t: number) => weekdayFmt.format(t);

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * Age of a timestamp (ms since epoch): "gerade eben", "vor 3 min", "heute 14:20", "Stand 9. Nov.".
 * Timestamps in the future are shown as time of day.
 */
export function formatAge(timestamp: number, now = Date.now()): string {
  const age = now - timestamp;
  if (age < 0) return sameDay(timestamp, now) ? `heute ${formatTime(timestamp)}` : formatDateTime(timestamp, now);
  if (age < 60_000) return 'gerade eben';
  if (age < 3_600_000) return `vor ${Math.floor(age / 60_000)}${NNBSP}min`;
  if (sameDay(timestamp, now)) return `heute ${formatTime(timestamp)}`;
  return `Stand ${formatDate(timestamp, now)}`;
}

const dirs = { lat: ['N', 'S'], lng: ['O', 'W'] } as const;
/** "52,52° N, 13,41° O" */
export function formatCoord(lat: number, lng: number, digits = 2): string {
  const part = (v: number, axis: 'lat' | 'lng') => `${numberFormat(digits).format(Math.abs(v))}°${NNBSP}${dirs[axis][v < 0 ? 1 : 0]}`;
  return `${part(lat, 'lat')}, ${part(lng, 'lng')}`;
}

export const formatPercent = (fraction: number, digits = 0) => `${numberFormat(digits).format(fraction * 100)}${NNBSP}%`;
