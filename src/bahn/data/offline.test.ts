import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '@/core/lastKnown.test';
import { saveDepartures, saveJourneys, savedDepartures, savedJourneys, withSavedStops } from './offline';
import type { Departure, Journey, Stop, Time, TransitProvider } from './types';

const stop = (id: string, name: string, lat = 53.75, lng = 11.47): Stop => ({ id, name, lat, lng });
const at = (planned: number): Time => ({ planned, actual: planned, delayMin: null });
const dep = (line: string, planned: number): Departure => ({ mode: 'regio', line, headsign: 'Wismar', time: at(planned), cancelled: false });
const ride = (planned: number): Journey => ({ departure: at(planned), arrival: at(planned + 600_000), transfers: 0, legs: [] });

const source = (fail: boolean, found: Stop[] = []): TransitProvider => {
  const answer = () => (fail ? Promise.reject(new Error('offline')) : Promise.resolve(found));
  return {
    searchStops: answer, nearbyStops: answer, stopsIn: answer, departures: () => Promise.resolve([]),
    journeys: () => Promise.resolve({ journeys: [] }), trip: () => Promise.reject(new Error('offline')),
  };
};

describe('Bahn without a network', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('searches and finds nearby stops among the ones seen before', async () => {
    const near = stop('a', 'Bad Kleinen');
    const far = stop('b', 'Schwerin Hbf', 53.635, 11.407);
    await withSavedStops(source(false, [near, far])).searchStops('x');
    const offline = withSavedStops(source(true), () => [stop('c', 'Wismar', 53.89, 11.46)]);
    expect((await offline.searchStops('schwerin')).map((s) => s.id)).toEqual(['b']);
    expect((await offline.searchStops('wismar')).map((s) => s.id)).toEqual(['c']);
    expect((await offline.nearbyStops(53.751, 11.471)).map((s) => s.id)).toEqual(['a']);
    await expect(offline.searchStops('Hamburg')).rejects.toThrow('offline');
  });

  it('keeps departures until they have left, also behind a shorter newer list', () => {
    const s = stop('a', 'Bad Kleinen');
    expect(savedDepartures(s, 0)).toBeUndefined();
    saveDepartures(s, [dep('RE 1', 100_000), dep('RE 2', 900_000)]);
    saveDepartures(s, [dep('RE 1', 100_000)]);
    expect(savedDepartures(s, 0)?.data.map((d) => d.line)).toEqual(['RE 1', 'RE 2']);
    expect(savedDepartures(s, 500_000)?.data.map((d) => d.line)).toEqual(['RE 2']);
  });

  it('answers a route with what is still ahead, or the last known if all have left', () => {
    const [a, b] = [stop('a', 'A'), stop('b', 'B')];
    const o = { time: 0, arriveBy: false };
    saveJourneys(a, b, o, [ride(100_000), ride(900_000)]);
    expect(savedJourneys(a, b, o, null, 500_000)?.data).toHaveLength(1);
    expect(savedJourneys(a, b, o, null, 9_000_000)?.data).toHaveLength(2);
    expect(savedJourneys(b, a, o, null, 0)).toBeUndefined();
    expect(savedJourneys(a, b, { ...o, time: 48 * 3_600_000 }, 48 * 3_600_000, 0)).toBeUndefined();
  });

  it('finds a route from the own location again after a small move', () => {
    const me = (lat: number) => stop(`${lat},11.47`, 'Mein Standort', lat);
    const o = { time: 0, arriveBy: false };
    saveJourneys(me(53.751), stop('b', 'B'), o, [ride(100_000)]);
    expect(savedJourneys(me(53.7512), stop('b', 'B'), o, null, 0)?.data).toHaveLength(1);
  });
});
