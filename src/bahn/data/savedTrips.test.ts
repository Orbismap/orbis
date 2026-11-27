import { describe, expect, it } from 'vitest';
import { currentRun, defaultDays, makeSavedTrip, matches, timetableOf, watched, type SavedTrip } from './savedTrips';
import type { Journey, Leg, Time } from './types';

/** local time, so the tests hold in every time zone */
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime(); // November 2026, the 30th is a Monday
const time = (t: number, delayMin: number | null = null): Time => ({ planned: t, actual: t + (delayMin ?? 0) * 60_000, delayMin });
const ride = (dep: number, arr: number): Leg => ({
  mode: 'regio', line: 'RE 8', headsign: 'Wismar', cancelled: false, tripId: 'day-id', via: [],
  from: { name: 'Bad Kleinen', stopId: 'a', lat: 53.7, lng: 11.4, time: time(dep, 4) },
  to: { name: 'Wismar', stopId: 'b', lat: 53.9, lng: 11.46, time: time(arr, 4) },
  path: Array.from({ length: 2000 }, (_, i) => [11.4 + i / 1e5, 53.7] as [number, number]),
});
const journey = (dep = at(30, 7, 12), arr = at(30, 7, 32)): Journey => ({ departure: time(dep, 4), arrival: time(arr, 4), transfers: 0, legs: [ride(dep, arr)] });

describe('saved connections', () => {
  it('keeps the timetable apart from the real time and thins the track', () => {
    const t = makeSavedTrip(journey(), at(30, 6));
    expect(t.journey.departure).toEqual(time(at(30, 7, 12)));
    expect(t.journey.legs[0]!.path).toHaveLength(300);
    expect(currentRun(t, at(30, 6)).journey.departure.delayMin).toBe(4);
  });
  it('is over some time after the arrival', () => {
    const t = makeSavedTrip(journey());
    expect(currentRun(t, at(30, 8, 30)).past).toBe(false);
    expect(currentRun(t, at(30, 10)).past).toBe(true);
  });
  it('moves a commuter trip to the next chosen weekday, at the same time and without the old real time', () => {
    const t: SavedTrip = { ...makeSavedTrip(journey()), commute: { days: [1, 3] } };
    const run = currentRun(t, at(30, 12)); // Monday noon → Wednesday 2 December
    expect(run.journey.departure).toEqual(time(new Date(2026, 11, 2, 7, 12).getTime()));
    expect(run.journey.legs[0]!.tripId).toBeUndefined();
    expect(run.liveAt).toBeUndefined();
    expect(run.past).toBe(false);
  });
  it('keeps the wall clock across the change from summer time', () => {
    const dep = new Date(2026, 9, 23, 7, 12).getTime(); // Friday before the change in Europe
    const t: SavedTrip = { ...makeSavedTrip(journey(dep, dep + 20 * 60_000)), commute: { days: [1] } };
    const next = new Date(currentRun(t, new Date(2026, 9, 24, 12).getTime()).journey.departure.planned);
    expect([next.getDate(), next.getHours(), next.getMinutes()]).toEqual([26, 7, 12]);
  });
  it('recognises a later run of a commuter trip, but only on its days', () => {
    const t = makeSavedTrip(journey());
    const week = 7 * 86_400_000;
    const later = timetableOf(journey(), week);
    expect(matches(t, later)).toBe(false);
    expect(matches({ ...t, commute: { days: [1] } }, later)).toBe(true);
    expect(matches({ ...t, commute: { days: [2] } }, later)).toBe(false);
  });
  it('proposes Monday to Friday, or the weekend day', () => {
    expect(defaultDays(journey())).toEqual([1, 2, 3, 4, 5]);
    expect(defaultDays(journey(at(28, 9), at(28, 10)))).toEqual([6]);
  });
  it('hands the push worker a dated single trip and an undated commuter trip, past ones not at all', () => {
    const t: SavedTrip = { ...makeSavedTrip(journey()), notify: { leads: [30], onlyDelay: true } };
    const [single] = watched([t], 'Europe/Berlin', at(30, 6));
    expect(single).toMatchObject({ line: 'RE 8', hm: '07:12', date: '2026-11-30', days: [1], from: { id: 'a', lon: 11.4 } });
    expect(watched([t], 'Europe/Berlin', at(30, 12))).toEqual([]);
    const [commute] = watched([{ ...t, commute: { days: [1, 2] } }], 'Europe/Berlin', at(30, 12));
    expect(commute!.days).toEqual([1, 2]);
    expect(commute).not.toHaveProperty('date');
    expect(watched([{ ...t, notify: undefined }], 'Europe/Berlin', at(30, 6))).toEqual([]);
  });
});
