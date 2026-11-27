// The saved connections of this device, and their real time.
import { signal } from '@preact/signals';
import { getJSON, setJSON } from '@/core/storage';
import { plannedJourney } from '../data';
import { currentRun, ends, hasRealTime, makeSavedTrip, matches, sameRides, timetableOf, type SavedTrip } from '../data/savedTrips';
import type { Journey } from '../data/types';
import { sources } from './sources';

const KEY = 'bahn:trips';
const MAX_TRIPS = 30;
/** real time is asked for runs that start within this time (further ahead nothing is known yet) */
const AHEAD_MS = 24 * 3_600_000;

const validate = (raw: unknown): SavedTrip[] | undefined =>
  Array.isArray(raw)
    ? raw.filter((t): t is SavedTrip => !!t && typeof t.id === 'string' && Array.isArray(t.journey?.legs) && t.journey.legs.length > 0 && Number.isFinite(t.journey.departure?.planned))
    : undefined;

export const trips = signal<SavedTrip[]>(getJSON(KEY, 1, validate, []));

/** False when the device refused to keep the list (storage full or blocked): then nothing changes. */
function write(next: SavedTrip[]): boolean {
  if (!setJSON(KEY, 1, next)) return false;
  trips.value = next;
  return true;
}

export const findTrip = (j: Journey): SavedTrip | undefined => trips.value.find((t) => matches(t, j));

export type SaveResult = SavedTrip | 'full' | 'storage';
export function saveTrip(j: Journey): SaveResult {
  const known = findTrip(j);
  if (known) return known;
  if (trips.peek().length >= MAX_TRIPS) return 'full';
  const trip = makeSavedTrip(j);
  return write([trip, ...trips.peek()]) ? trip : 'storage';
}

export const removeTrip = (id: string) => write(trips.peek().filter((t) => t.id !== id));
export const updateTrip = (id: string, patch: Partial<SavedTrip>) => write(trips.peek().map((t) => (t.id === id ? { ...t, ...patch } : t)));

/** Fetches the real time of the current run and keeps it. True when something new arrived. */
export async function refreshTrip(id: string, signal?: AbortSignal, now = Date.now()): Promise<boolean> {
  const trip = trips.peek().find((t) => t.id === id);
  if (!trip) return false;
  const run = currentRun(trip, now);
  if (run.past || run.journey.departure.planned - now > AHEAD_MS) return false;
  const planned = timetableOf(run.journey);
  let found: Journey | undefined;
  let failed: unknown;
  const at = ends(planned);
  if (at) {
    try {
      const first = planned.legs.find((l) => l.mode !== 'fuss')!;
      const page = await sources.transit.journeys(at.from, at.to, { time: first.from.time.planned - 60_000, arriveBy: false }, undefined, signal);
      found = page.journeys.find((j) => sameRides(j, planned));
    } catch (e) {
      failed = e;
    }
  }
  // the search gives bus and tram real time; trains get theirs from the DB data (which also works on the kept timetable)
  let fresh = found;
  if (sources.delays) {
    const base = found ? plannedJourney(found) : planned;
    const [merged] = await sources.delays.journeys([found ?? planned], signal);
    fresh = merged?.delaySource === 'db' ? merged : found ? base : undefined;
  }
  if (signal?.aborted) return false;
  if (!fresh || !hasRealTime(fresh)) {
    if (failed) throw failed;
    return false;
  }
  // the kept geometry stays: the saved connection looks the same without a network
  const legs = fresh.legs.length === planned.legs.length ? fresh.legs.map((l, i) => ({ ...l, path: planned.legs[i]!.path })) : fresh.legs;
  return updateTrip(id, { live: { at: Date.now(), run: planned.departure.planned, journey: { ...fresh, legs } } });
}
