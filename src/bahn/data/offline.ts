// What the Bahn app keeps for the time without a network (core/lastKnown.ts):
//  - every stop it has seen: search and "nearby" answer from them when the source cannot be reached,
//  - the departures per stop and the connections per route: the screens show them with their age until a fresh answer is there.
import { haversine } from '@/core/geo';
import { lastKnown, type Known } from '@/core/lastKnown';
import { matchesQuery, rankStops } from './stops';
import type { Departure, Journey, JourneyOptions, Stop, TransitProvider } from './types';

const MAX_STOPS = 300;
/** "nearby" without a network: known stops up to this far (km). */
const NEARBY_KM = 1.5;
/** A departure or connection stays on the list this long after it left. */
const GRACE_MS = 60_000;
/** Saved connections answer a search for a chosen time if they lie this close to it. */
const SAME_TIME_MS = 6 * 3_600_000;

const stops = lastKnown<Stop[]>('bahn:stops', 1);
const departures = lastKnown<Departure[]>('bahn:departures', 40);
const journeys = lastKnown<Journey[]>('bahn:journeys', 20);

const seen = (): Stop[] => stops.get('seen')?.data ?? [];
function remember(found: Stop[]) {
  if (!found.length) return;
  const ids = new Set(found.map((s) => s.id));
  stops.put('seen', [...found, ...seen().filter((s) => !ids.has(s.id))].slice(0, MAX_STOPS));
}

/**
 * Search and "nearby" go on without a network: they answer from the stops seen before, `kept` adds the user's own (favourites,
 * recent searches). With nothing that fits, the error of the source stays.
 */
export function withSavedStops(source: TransitProvider, kept: () => Stop[] = () => []): TransitProvider {
  const known = () => {
    const own = kept();
    const ids = new Set(own.map((s) => s.id));
    return [...own, ...seen().filter((s) => !ids.has(s.id))];
  };
  const orSaved = async (ask: Promise<Stop[]>, saved: () => Stop[], signal?: AbortSignal) => {
    try {
      const found = await ask;
      remember(found);
      return found;
    } catch (e) {
      const hit = signal?.aborted ? [] : saved();
      if (!hit.length) throw e;
      return hit;
    }
  };
  return {
    ...source,
    searchStops: (query, signal) =>
      orSaved(source.searchStops(query, signal), () => rankStops(known().filter((s) => matchesQuery(s.name, query)), query), signal),
    nearbyStops: (lat, lng, signal) =>
      orSaved(source.nearbyStops(lat, lng, signal), () => known()
        .map((s) => ({ s, km: haversine([lng, lat], [s.lng, s.lat]) }))
        .filter((x) => x.km <= NEARBY_KM)
        .sort((a, b) => a.km - b.km)
        .map((x) => x.s), signal),
  };
}

/** Keeps the departures of a stop. A short list (the start screen asks for few) leaves the later ones saved before in place. */
export function saveDepartures(stop: Stop, list: Departure[]): void {
  const until = Math.max(...list.map((d) => d.time.planned));
  const later = list.length ? departures.get(stop.id)?.data.filter((d) => d.time.planned > until) ?? [] : [];
  departures.put(stop.id, [...list, ...later]);
}

/** The saved departures of a stop that have not left yet. */
export function savedDepartures(stop: Stop, now = Date.now()): Known<Departure[]> | undefined {
  const k = departures.get(stop.id);
  return k && { at: k.at, data: k.data.filter((d) => d.time.actual >= now - GRACE_MS) };
}

/** The own location moves a little with every fix: routes from there are kept per square of about a kilometre. */
const placeKey = (s: Stop) => (s.name === 'Mein Standort' ? `me:${s.lat.toFixed(2)},${s.lng.toFixed(2)}` : s.id);
const routeKey = (from: Stop, to: Stop, o: JourneyOptions) =>
  [placeKey(from), placeKey(to), o.arriveBy ? 'an' : 'ab', [...(o.modes ?? [])].sort().join(',')].join('|');

export function saveJourneys(from: Stop, to: Stop, o: JourneyOptions, list: Journey[]): void {
  if (list.length) journeys.put(routeKey(from, to, o), list);
}

/**
 * The saved connections of a route. For "now" (`asked` null) the ones still ahead, or all of them if every one has left; for a
 * chosen time only the ones close to it.
 */
export function savedJourneys(from: Stop, to: Stop, o: JourneyOptions, asked: number | null, now = Date.now()): Known<Journey[]> | undefined {
  const k = journeys.get(routeKey(from, to, o));
  if (!k) return undefined;
  if (asked === null) {
    const ahead = k.data.filter((j) => j.departure.actual >= now - GRACE_MS);
    return { at: k.at, data: ahead.length ? ahead : k.data };
  }
  const near = k.data.filter((j) => Math.abs((o.arriveBy ? j.arrival : j.departure).planned - asked) <= SAME_TIME_MS);
  return near.length ? { at: k.at, data: near } : undefined;
}
