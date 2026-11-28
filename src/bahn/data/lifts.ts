import { isRail } from './modes';
import type { Journey } from './types';

/**
 * Aufzüge an den Bahnhöfen einer Verbindung aus FaSta (DB InfraGO), abgefragt über denselben Worker wie die
 * Verspätungen (`POST /db/lifts`). Gezeigt wird der Zustand von jetzt, nicht der zur Reisezeit.
 */

export interface StationLifts {
  total: number;
  /** Außer Betrieb. */
  broken: { text: string; reason?: string }[];
  /** Zustand nicht gemeldet. */
  unknown: { text: string }[];
}

export type LiftLookup = (names: string[], signal?: AbortSignal) => Promise<(StationLifts | null)[]>;

/** Weiter im Voraus sagt der Zustand von jetzt nichts. */
const AHEAD_MS = 24 * 3600_000;
const MAX_STATIONS = 8;

const same = (name: string) => name.toLowerCase().replace(/^s(\s*\+\s*u)?\s+/, '').replace(/hauptbahnhof/g, 'hbf').trim();

/** Wo man in einen Zug ein- oder aus ihm aussteigt, in Reisereihenfolge; leer für vergangene und ferne Fahrten. */
export function liftStations(j: Journey, now: number): string[] {
  if (j.arrival.actual < now || j.departure.planned - now > AHEAD_MS) return [];
  const names = j.legs.filter((l) => isRail(l.mode)).flatMap((l) => [l.from.name, l.to.name]);
  return [...new Map(names.map((n) => [same(n), n])).values()].slice(0, MAX_STATIONS);
}

export function createLifts(baseUrl: string, fetchFn: typeof fetch = fetch): LiftLookup {
  return async (stations, signal) => {
    const none = stations.map(() => null);
    if (!stations.length) return none;
    try {
      const res = await fetchFn(`${baseUrl}/db/lifts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stations }), signal });
      return res.ok ? ((await res.json()) as { results: (StationLifts | null)[] }).results : none;
    } catch {
      return none;
    }
  };
}
