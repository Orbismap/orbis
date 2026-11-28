import { HttpError } from '@/data/http';
import { isRail } from './modes';
import { journeyOf } from './transitous';
import type { Call, DelayEnricher, Departure, Journey, Leg, Stop, Time } from './types';

/**
 * Echtzeit der Bahn aus den DB-Fahrplandaten. Der Schlüssel liegt im Worker (Orbismap/data, `workers/push`,
 * `POST /db/delays`), die App braucht keinen eigenen. Transitous liefert die Verbindungen sofort; die genauen
 * Verspätungen, Gleise und Ausfälle kommen danach dazu. Nur Züge, die die DB kennt, werden ersetzt.
 */

export const DEFAULT_DELAYS_URL = 'https://orbis-trains.malte9799.workers.dev';

interface Query {
  station: string;
  ts: number;
  kind: 'dep' | 'arr';
  line: string;
}
interface Hit {
  delayMin: number | null;
  cancelled: boolean;
  track?: string;
  trackChanged?: boolean;
}

const keyOf = (q: Query) => `${q.station}|${q.ts}|${q.kind}|${q.line}`;
const withDelay = (t: Time, h: Hit): Time => ({ ...t, actual: t.planned + (h.delayMin ?? 0) * 60000, delayMin: h.delayMin, delaySource: 'db' });

/** Nur Fahrplanzeiten für Züge, solange die DB-Daten laden (die Transitous-Verspätungen der Bahn sind unzuverlässig). */
const plannedTime = (t: Time): Time => ({ planned: t.planned, actual: t.planned, delayMin: null });
const plannedCall = (c: Call): Call => ({ ...c, time: plannedTime(c.time) });

export function plannedJourney(j: Journey): Journey {
  const legs = j.legs.map((l): Leg => (isRail(l.mode) ? { ...l, from: plannedCall(l.from), to: plannedCall(l.to), via: l.via.map(plannedCall) } : l));
  return journeyOf(legs, j.transfers);
}

export const plannedDepartures = (list: Departure[]): Departure[] =>
  list.map((d) => (isRail(d.mode) ? { ...d, time: plannedTime(d.time) } : d));

/** „pünktlich“ nur, wenn es belegt ist: Von jedem Fahrzeug sind Ab- und Ankunft bekannt und keine ab 2 min zu spät. */
export function provenOnTime(j: Journey): boolean {
  const rides = j.legs.filter((l) => l.mode !== 'fuss');
  const ok = (t: Time) => t.delayMin !== null && t.delayMin < 2;
  return rides.length > 0 && rides.every((l) => !l.cancelled && ok(l.from.time) && ok(l.to.time));
}

export interface DelayOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export function createDbDelays({ baseUrl = DEFAULT_DELAYS_URL, fetchFn = fetch }: DelayOptions = {}): DelayEnricher {
  let pausedUntil = 0;
  let failures = 0;

  async function lookup(queries: Query[], signal?: AbortSignal): Promise<(Hit | null)[]> {
    const none = queries.map(() => null);
    if (!queries.length || Date.now() < pausedUntil) return none;
    const chunks: Query[][] = [];
    for (let i = 0; i < queries.length; i += 40) chunks.push(queries.slice(i, i + 40));
    try {
      const parts = await Promise.all(
        chunks.map(async (chunk) => {
          const res = await fetchFn(`${baseUrl}/db/delays`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queries: chunk }),
            signal,
          });
          if (!res.ok) throw new HttpError('http', `HTTP ${res.status}`, res.status);
          return ((await res.json()) as { results: (Hit | null)[] }).results;
        }),
      );
      failures = 0;
      return parts.flat();
    } catch (e) {
      if (signal?.aborted) return none;
      // Nicht eingerichtet (501), ausgefallen oder unterwegs ohne Netz: nicht jede Suche darauf warten lassen.
      // Ein einzelner Aussetzer kostet 30 s, die Pause verdoppelt sich je Fehler in Folge bis 5 min.
      pausedUntil = Date.now() + Math.min(30000 * 2 ** failures++, 5 * 60000);
      return none;
    }
  }

  const callQueries = (l: Leg): [Query, Query] => [
    { station: l.from.name, ts: l.from.time.planned, kind: 'dep', line: l.line },
    { station: l.to.name, ts: l.to.time.planned, kind: 'arr', line: l.line },
  ];
  const trackOf = (c: Call, h: Hit): Call => ({ ...c, platform: h.track ?? c.platform, platformChanged: h.trackChanged || c.platformChanged, time: withDelay(c.time, h) });

  return {
    async journeys(list, signal) {
      const qs = new Map<string, Query>();
      for (const j of list) for (const l of j.legs) if (isRail(l.mode) && l.line) callQueries(l).forEach((q) => qs.set(keyOf(q), q));
      const queries = [...qs.values()];
      const hits = await lookup(queries, signal);
      const found = new Map(queries.map((q, i) => [keyOf(q), hits[i] ?? null]));
      if (![...found.values()].some(Boolean)) return list;

      return list.map((j) => {
        let matched = false;
        const legs = j.legs.map((l): Leg => {
          if (!isRail(l.mode) || !l.line) return l;
          const [dq, aq] = callQueries(l);
          const d = found.get(keyOf(dq));
          const a = found.get(keyOf(aq));
          if (!d && !a) return l;
          matched = true;
          // Je Seite: Ein nur über die Ankunft gefundener Abschnitt behält die Abfahrt von Transitous und umgekehrt.
          return {
            ...l,
            from: d ? trackOf(l.from, d) : l.from,
            to: a ? trackOf(l.to, a) : l.to,
            cancelled: l.cancelled || !!d?.cancelled || !!a?.cancelled,
          };
        });
        return matched ? journeyOf(legs, j.transfers, 'db') : j;
      });
    },

    async departures(stop: Stop, list, signal) {
      const queries = list.filter((d) => isRail(d.mode) && d.line).map((d): Query => ({ station: stop.name, ts: d.time.planned, kind: 'dep', line: d.line }));
      const hits = await lookup(queries, signal);
      const found = new Map(queries.map((q, i) => [keyOf(q), hits[i] ?? null]));
      if (![...found.values()].some(Boolean)) return list;
      return list.map((d) => {
        const h = isRail(d.mode) && d.line ? found.get(keyOf({ station: stop.name, ts: d.time.planned, kind: 'dep', line: d.line })) : null;
        return h ? { ...d, time: withDelay(d.time, h), platform: h.track ?? d.platform, platformChanged: h.trackChanged || d.platformChanged, cancelled: d.cancelled || h.cancelled } : d;
      });
    },
  };
}
