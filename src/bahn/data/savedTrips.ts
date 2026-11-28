// A saved connection: one concrete journey, kept completely on the device so that it opens without a network. It can be
// turned into a commuter trip (the same rides on chosen weekdays) and can be watched by the push worker.
import type { Call, Journey, Leg, Stop, Time } from './types';

export interface Notify {
  /** minutes before the departure of the first ride */
  leads: number[];
  /** stay quiet while the train is on time */
  onlyDelay: boolean;
}

export interface SavedTrip {
  id: string;
  /** the timetable of the day it was saved for, without real time */
  journey: Journey;
  /** the last real time that arrived, for one run (named by its planned departure) */
  live?: { at: number; run: number; journey: Journey };
  savedAt: number;
  /** commuter trip: the weekdays it is ridden (0 = Sunday … 6 = Saturday) */
  commute?: { days: number[] };
  notify?: Notify;
}

/** lead times offered in the app */
export const LEADS = [30, 20, 10, 5];
/** the push worker keeps this many trips per device (Orbismap/data, workers/push: MAX_TRIPS) */
export const MAX_WATCHED = 10;
/** a run stays "the current one" this long after its planned arrival (a late train is still on the way) */
export const OVER_AFTER_MS = 90 * 60_000;
/** the track geometry is thinned to this many points per leg, so that saved trips stay small */
const PATH_POINTS = 300;

export const rides = (j: Journey): Leg[] => j.legs.filter((l) => l.mode !== 'fuss');
const minute = (t: number) => Math.round(t / 60_000);
/** The same rides at the same planned times. */
export const sameRides = (a: Journey, b: Journey): boolean => {
  const x = rides(a), y = rides(b);
  return x.length > 0 && x.length === y.length && x.every((l, i) => l.line === y[i]!.line && minute(l.from.time.planned) === minute(y[i]!.from.time.planned));
};

const pad = (n: number) => String(n).padStart(2, '0');
export const hm = (t: number): string => `${pad(new Date(t).getHours())}:${pad(new Date(t).getMinutes())}`;
export const isoDate = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function tripId(j: Journey): string {
  const list = rides(j);
  const first = list[0] ?? j.legs[0]!;
  const last = list[list.length - 1] ?? j.legs[j.legs.length - 1]!;
  return [first.line, minute(first.from.time.planned), first.from.stopId ?? first.from.name, last.to.stopId ?? last.to.name].join('|').slice(0, 280);
}

/** Moves every time by `ms` and forgets all real time: what the timetable says. `ms` ≠ 0 also drops the ids of that day's rides. */
export function timetableOf(j: Journey, ms = 0): Journey {
  const time = (t: Time): Time => ({ planned: t.planned + ms, actual: t.planned + ms, delayMin: null });
  const call = (c: Call): Call => ({ ...c, platformChanged: undefined, time: time(c.time) });
  const { delaySource: _source, ...rest } = j;
  return {
    ...rest,
    departure: time(j.departure),
    arrival: time(j.arrival),
    legs: j.legs.map((l) => ({ ...l, cancelled: false, cause: undefined, notes: undefined, tripId: ms ? undefined : l.tripId, from: call(l.from), to: call(l.to), via: l.via.map(call) })),
  };
}

function thin<T>(list: T[], max: number): T[] {
  if (list.length <= max) return list;
  const step = (list.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => list[Math.round(i * step)]!);
}
const compact = (j: Journey): Journey => ({ ...j, legs: j.legs.map((l) => (l.path ? { ...l, path: thin(l.path, PATH_POINTS) } : l)) });

/** Whether anything in it is known beyond the timetable. (The DB data answer "unknown" for trains still far ahead.) */
export const hasRealTime = (j: Journey): boolean => j.legs.some((l) => l.cancelled || l.from.time.delayMin !== null || l.to.time.delayMin !== null);

export function makeSavedTrip(j: Journey, now = Date.now()): SavedTrip {
  const journey = compact(timetableOf(j));
  return { id: tripId(j), journey, savedAt: now, live: hasRealTime(j) ? { at: now, run: journey.departure.planned, journey: compact(j) } : undefined };
}

/** The same calendar distance for the wall clock: 07:12 stays 07:12 across a change to or from summer time. */
function onDay(t: number, day: Date): number {
  const d = new Date(t);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()).getTime();
}

export interface Run {
  /** the connection of this run: with real time when some is kept for it, else the timetable */
  journey: Journey;
  /** when the kept real time arrived */
  liveAt?: number;
  /** a single trip that is over */
  past: boolean;
}

/** The run to show: for a commuter trip today's while it is not over, else the next chosen weekday's. */
export function currentRun(t: SavedTrip, now = Date.now()): Run {
  const base = t.journey;
  let journey = base;
  const days = t.commute?.days ?? [];
  if (days.length) {
    const today = new Date(now);
    // from yesterday on: a ride over midnight may still be running
    for (let off = -1; off <= 8; off++) {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + off);
      if (!days.includes(day.getDay())) continue;
      const shift = onDay(base.departure.planned, day) - base.departure.planned;
      if (base.arrival.planned + shift + OVER_AFTER_MS < now) continue;
      journey = shift ? timetableOf(base, shift) : base;
      break;
    }
  }
  const past = !days.length && journey.arrival.planned + OVER_AFTER_MS < now;
  const live = t.live && t.live.run === journey.departure.planned ? t.live : undefined;
  return { journey: live?.journey ?? journey, liveAt: live?.at, past };
}

/** Whether `j` is this saved trip: the very connection, or a run of the commuter trip. */
export function matches(t: SavedTrip, j: Journey): boolean {
  if (sameRides(t.journey, j)) return true;
  if (!t.commute?.days.includes(new Date(j.departure.planned).getDay())) return false;
  const shift = onDay(t.journey.departure.planned, new Date(j.departure.planned)) - t.journey.departure.planned;
  return sameRides(timetableOf(t.journey, shift), j);
}

/** Weekdays proposed for a new commuter trip: Monday to Friday, or the weekend day it was saved for. */
export function defaultDays(j: Journey): number[] {
  const day = new Date(j.departure.planned).getDay();
  return day >= 1 && day <= 5 ? [1, 2, 3, 4, 5] : [day];
}

const WEEK: [number, string][] = [[1, 'Mo'], [2, 'Di'], [3, 'Mi'], [4, 'Do'], [5, 'Fr'], [6, 'Sa'], [0, 'So']];
export const WEEKDAYS = WEEK;
export function daysText(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return 'täglich';
  if (!set.size) return 'kein Tag';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Mo–Fr';
  return WEEK.filter(([d]) => set.has(d)).map(([, n]) => n).join(', ');
}

/** Start and destination of the rides, as stops: what a fresh search for this connection asks for. */
export function ends(j: Journey): { from: Stop; to: Stop } | null {
  const list = rides(j);
  const a = list[0]?.from, b = list[list.length - 1]?.to;
  const stop = (c: Call | undefined): Stop | null =>
    c && c.stopId && c.lat !== undefined && c.lng !== undefined ? { id: c.stopId, name: c.name, lat: c.lat, lng: c.lng } : null;
  const from = stop(a), to = stop(b);
  return from && to ? { from, to } : null;
}

/** One trip as the push worker takes it. It watches the first ride. */
export interface WatchedTrip {
  id: string;
  from: { id: string; name: string; lat: number; lon: number; src: 'motis' };
  to: { id: string; name: string; lat: number; lon: number; src: 'motis' };
  line: string;
  hm: string;
  tz: string;
  days: number[];
  leads: number[];
  onlyDelay: boolean;
  /** a single trip: only on this day ("2026-11-30") */
  date?: string;
}

/** What the worker has to watch: trips with notifications that still lie ahead, the soonest first. */
export function watched(trips: SavedTrip[], tz: string, now = Date.now()): WatchedTrip[] {
  const out: { at: number; trip: WatchedTrip }[] = [];
  for (const t of trips) {
    if (!t.notify?.leads.length || (t.commute && !t.commute.days.length)) continue;
    const first = rides(t.journey)[0];
    const at = ends(t.journey);
    if (!first || !at) continue;
    const run = currentRun(t, now);
    if (run.past) continue;
    const dep = first.from.time.planned;
    const place = (s: Stop) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lng, src: 'motis' as const });
    out.push({
      at: run.journey.departure.planned,
      trip: {
        id: t.id, from: place(at.from), to: place(at.to), line: first.line, hm: hm(dep), tz,
        days: t.commute?.days ?? [new Date(dep).getDay()],
        leads: t.notify.leads, onlyDelay: t.notify.onlyDelay,
        ...(t.commute ? {} : { date: isoDate(dep) }),
      },
    });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_WATCHED).map((x) => x.trip);
}
