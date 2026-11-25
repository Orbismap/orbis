import { HOUR, MINUTE, DAY } from '../../core/time';

const hm = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const wdHm = new Intl.DateTimeFormat('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

const cleanup = (s: string) => s.replace(/^(\p{L}+)\.,\s*/u, '$1 ');

const dayLongMonth = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
/** Jahreszahl mit Zusatz vor unserer Zeitrechnung (Jahr 0 = 1 v. Chr.). */
export const yearLabel = (y: number) => (y > 0 ? String(y) : `${1 - y} v. Chr.`);
const yearFmt = { format: (t: number) => yearLabel(new Date(t).getFullYear()) };
const monthYearFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const dayYearFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Der gewählte Zeitpunkt so fein, wie die Daten aufgelöst sind (`step`, ms): Jahresdaten → "2026", Monatsdaten → "Juni 2026",
 * Tagesdaten → "Sa 20. Juni", sonst mit Uhrzeit ("Sa 20. Juni, 02:00"). Nicht die Breite des Zeitbereichs zählt: der Zeitpunkt
 * ist immer ein bestimmter Tag, auch wenn die Leiste ein ganzes Jahr zeigt.
 */
export function formatSelected(t: number, step = 0): string {
  if (step >= 300 * DAY) return yearFmt.format(t);
  if (step >= 28 * DAY) return monthYearFmt.format(t);
  const sameYear = new Date(t).getFullYear() === new Date().getFullYear();
  const day = sameYear ? dayLongMonth.format(t) : dayYearFmt.format(t);
  return cleanup(step >= DAY ? day : `${day}, ${hm.format(t)}`);
}
export interface SelectedParts { time?: string; weekday?: string; day?: string; rest: string }
/**
 * Dieselbe Anzeige in Teilen, damit jedes Teil eine feste Breite haben und einzeln überblenden kann:
 * Uhrzeit zuerst ("14:00"), dann Wochentag, zweistelliger Tag ("01") und Monat.
 */
export function selectedParts(t: number, step = 0): SelectedParts {
  if (step >= 300 * DAY) return { rest: yearFmt.format(t) };
  if (step >= 28 * DAY) return { rest: monthYearFmt.format(t) };
  const d = new Date(t);
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return {
    time: step >= DAY ? undefined : hm.format(t),
    weekday: noDot(new Intl.DateTimeFormat('de-DE', { weekday: 'short' }).format(t)),
    day: `${String(d.getDate()).padStart(2, '0')}.`,
    rest: `${new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(t)}${year}`,
  };
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
  if (a < 100 * DAY) return `${sign}${Math.round(a / DAY)} Tg.`;
  if (a < 2 * 365 * DAY) return `${sign}${Math.round(a / (30.44 * DAY))} Mon.`;
  const years = Math.round(a / (365.25 * DAY));
  return `${sign}${years} ${years === 1 ? 'Jahr' : 'Jahren'}`;
}

type Unit = 'hour' | 'day' | 'week' | 'month' | 'year';
interface Step { unit: Unit; n: number }
interface Scale extends Step { approx: number; parent: Step | null }

const YEAR = 365.25 * DAY;
const DAY1: Step = { unit: 'day', n: 1 };
const MONTH1: Step = { unit: 'month', n: 1 };
const years = (n: number): Step => ({ unit: 'year', n });
/** Von fein nach grob bis zu Jahrtausenden; `parent` ist die übergeordnete Einheit, die als Kontextzeile darüber steht. */
const SCALES: Scale[] = [
  { unit: 'hour', n: 1, approx: HOUR, parent: DAY1 },
  { unit: 'hour', n: 3, approx: 3 * HOUR, parent: DAY1 },
  { unit: 'hour', n: 6, approx: 6 * HOUR, parent: DAY1 },
  { unit: 'hour', n: 12, approx: 12 * HOUR, parent: DAY1 },
  { unit: 'day', n: 1, approx: DAY, parent: MONTH1 },
  { unit: 'week', n: 1, approx: 7 * DAY, parent: MONTH1 },
  { unit: 'month', n: 1, approx: 30.4 * DAY, parent: years(1) },
  { unit: 'month', n: 3, approx: 91.3 * DAY, parent: years(1) },
  { unit: 'year', n: 1, approx: YEAR, parent: years(10) },
  { unit: 'year', n: 5, approx: 5 * YEAR, parent: years(10) },
  { unit: 'year', n: 10, approx: 10 * YEAR, parent: years(100) },
  { unit: 'year', n: 50, approx: 50 * YEAR, parent: years(100) },
  { unit: 'year', n: 100, approx: 100 * YEAR, parent: years(1000) },
  { unit: 'year', n: 500, approx: 500 * YEAR, parent: years(1000) },
  { unit: 'year', n: 1000, approx: 1000 * YEAR, parent: null },
  { unit: 'year', n: 5000, approx: 5000 * YEAR, parent: null },
  { unit: 'year', n: 10000, approx: 10000 * YEAR, parent: null },
];

/** Datum auch für Jahre unter 100 (new Date(y, …) macht daraus 19xx). */
function mk(y: number, m: number, d: number, h = 0): Date {
  const x = new Date(2000, 0, 1);
  x.setFullYear(y, m, d);
  x.setHours(h, 0, 0, 0);
  return x;
}
function floorTo({ unit, n }: Step, t: number): Date {
  const d = new Date(t);
  const y = d.getFullYear();
  switch (unit) {
    case 'hour': return mk(y, d.getMonth(), d.getDate(), Math.floor(d.getHours() / n) * n);
    case 'day': return mk(y, d.getMonth(), d.getDate());
    case 'week': return mk(y, d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    case 'month': return mk(y, Math.floor(d.getMonth() / n) * n, 1);
    case 'year': return mk(Math.floor(y / n) * n, 0, 1);
  }
}
function advance({ unit, n }: Step, d: Date): Date {
  const y = d.getFullYear();
  switch (unit) {
    case 'hour': return mk(y, d.getMonth(), d.getDate(), d.getHours() + n);
    case 'day': return mk(y, d.getMonth(), d.getDate() + 1);
    case 'week': return mk(y, d.getMonth(), d.getDate() + 7);
    case 'month': return mk(y, d.getMonth() + n, 1);
    case 'year': return mk(y + n, 0, 1);
  }
}
/** Grenzen einer Einheit im Bereich [start, end]; eine davor und eine dahinter, damit der erste Abschnitt seinen Anfang kennt. */
function boundaries(step: Step, start: number, end: number): number[] {
  const out: number[] = [];
  let d = floorTo(step, start);
  for (let i = 0; i < 600; i++) {
    out.push(d.getTime());
    if (d.getTime() > end) break;
    d = advance(step, d);
  }
  return out;
}

const wd = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const mShort = new Intl.DateTimeFormat('de-DE', { month: 'short' });
const mLong = new Intl.DateTimeFormat('de-DE', { month: 'long' });
const noDot = (s: string) => s.replace(/\.$/, '');

/**
 * Eine Beschriftung: `labels` von lang nach kurz (gezeichnet wird die erste, die Platz hat), `major` bei Beginn der
 * übergeordneten Einheit (Mitternacht, Monatsersten, Jahresanfang). Wie bei d3 und Grafana zeigt so ein Strich den
 * größeren Zusammenhang selbst ("Do 12. Nov" statt "00:00"), und es braucht keine zweite Zeile.
 */
export interface Tick { t: number; labels: string[]; major: boolean; /** Kein Strich: Anfang des Ausschnitts, der seinen übergeordneten Abschnitt benennt. */ lead?: boolean }
export interface Axis {
  ticks: Tick[];
  /** Feinere Striche ohne Beschriftung, wenn Platz ist. */
  minor: number[];
}

/** Beschriftung der Stufe selbst. */
function minorLabels(s: Scale, t: number): string[] {
  const d = new Date(t);
  const y = d.getFullYear();
  switch (s.unit) {
    case 'hour': return [`${d.getHours()} Uhr`, String(d.getHours())];
    case 'day': return [`${noDot(wd.format(t))} ${d.getDate()}.`, String(d.getDate())];
    case 'week': return [`${d.getDate()}. ${noDot(mShort.format(t))}`, `${d.getDate()}.`];
    case 'month': return [mLong.format(t), noDot(mShort.format(t))];
    case 'year': return [yearLabel(y)];
  }
}
/** Beschriftung des Beginns einer übergeordneten Einheit. */
function majorLabels(p: Step, t: number): string[] {
  const d = new Date(t);
  const y = d.getFullYear();
  switch (p.unit) {
    case 'day': return [`${noDot(wd.format(t))} ${d.getDate()}. ${noDot(mShort.format(t))}`, `${noDot(wd.format(t))} ${d.getDate()}.`];
    case 'month': return d.getMonth() === 0 ? [`${mLong.format(t)} ${y}`, String(y)] : [mLong.format(t), noDot(mShort.format(t))];
    case 'year':
      if (p.n === 1) return [yearLabel(y)];
      if (p.n === 10) return [y > 0 ? `${y}er` : yearLabel(y), yearLabel(y)];
      if (p.n === 100) return y > 0 ? [`${Math.floor(y / 100) + 1}. Jahrhundert`, `${Math.floor(y / 100) + 1}. Jh.`] : [yearLabel(y)];
      return y > 0 ? [`${Math.floor(y / 1000) + 1}. Jahrtausend`, `${Math.floor(y / 1000) + 1}. Jt.`] : [yearLabel(y)];
    default: return [];
  }
}

/** Zeitachse für den sichtbaren Bereich: nimmt die feinste Stufe, deren Beschriftungen noch Platz haben. */
export function buildAxis(start: number, end: number, width: number, minPx = 46): Axis {
  const pxPerMs = width / Math.max(1, end - start);
  // Stunden nur bei kurzen Ausschnitten: sonst reichen Tage, die Uhrzeit steht in der Anzeige darüber
  const usable = SCALES.filter((c) => c.unit !== 'hour' || end - start <= 2 * DAY);
  const s = usable.find((c) => c.approx * pxPerMs >= minPx) ?? usable[usable.length - 1]!;
  const parentStarts = new Set(s.parent ? boundaries(s.parent, start, end) : []);
  const ticks: Tick[] = boundaries(s, start, end)
    .filter((t) => t >= start && t <= end)
    .map((t) => {
      const major = parentStarts.has(t);
      return { t, labels: major && s.parent ? majorLabels(s.parent, t) : minorLabels(s, t), major };
    });
  // Beginnt der Ausschnitt mitten in einem Tag/Monat/Jahr, benennt eine Marke am linken Rand diesen Abschnitt
  if (s.parent) {
    const first = ticks.find((t) => t.major);
    if (!first || (first.t - start) * pxPerMs > 80) ticks.unshift({ t: start, labels: majorLabels(s.parent, floorTo(s.parent, start).getTime()), major: true, lead: true });
  }
  const finer = usable[usable.indexOf(s) - 1];
  const minor = finer && finer.approx * pxPerMs >= 7 ? boundaries(finer, start, end).filter((t) => t >= start && t <= end) : [];
  return { ticks, minor };
}

/** Wählt für jede Marke die längste Beschriftung, die frei steht; Hauptmarken zuerst. `x` = Pixel, `measure` = Textbreite. */
export function placeLabels(ticks: Tick[], x: (t: number) => number, measure: (s: string) => number, width: number, pad = 6): { x: number; text: string; major: boolean }[] {
  const taken: [number, number][] = [];
  const free = (a: number, b: number) => taken.every(([c, d]) => b + pad <= c || a >= d + pad);
  const out: { x: number; text: string; major: boolean }[] = [];
  const order = [...ticks.filter((t) => t.major), ...ticks.filter((t) => !t.major)];
  for (const tk of order) {
    const lx = Math.max(x(tk.t) + 5, 4);
    for (const text of tk.labels) {
      const wpx = measure(text);
      if (lx + wpx > width - 2 || !free(lx, lx + wpx)) continue;
      taken.push([lx, lx + wpx]);
      out.push({ x: lx, text, major: tk.major });
      break;
    }
  }
  return out;
}
