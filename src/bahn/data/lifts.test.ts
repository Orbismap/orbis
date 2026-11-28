import { describe, expect, it, vi } from 'vitest';
import { createLifts, liftStations } from './lifts';
import type { Journey, Leg, ModeGroup } from './types';

const now = Date.parse('2026-11-28T12:00:00Z');
const time = (min: number) => ({ planned: now + min * 60000, actual: now + min * 60000, delayMin: null });
const leg = (mode: ModeGroup, from: string, to: string) => ({ mode, from: { name: from }, to: { name: to } }) as Leg;
const journey = (dep: number, arr: number) =>
  ({ departure: time(dep), arrival: time(arr), legs: [leg('bus', 'Dorf', 'Berlin Hbf'), leg('fern', 'S+U Berlin Hauptbahnhof', 'Hamburg Hbf'), leg('fuss', 'Hamburg Hbf', 'Hamburg Hbf (S-Bahn)'), leg('sbahn', 'Hamburg Hbf', 'Altona')] }) as Journey;

describe('Aufzüge', () => {
  it('fragt jeden Bahnhof der Züge einmal, ohne Bushalte', () => {
    expect(liftStations(journey(30, 180), now)).toEqual(['S+U Berlin Hauptbahnhof', 'Hamburg Hbf', 'Altona']);
  });

  it('fragt nicht für vergangene oder ferne Fahrten', () => {
    expect(liftStations(journey(-200, -1), now)).toEqual([]);
    expect(liftStations(journey(25 * 60, 27 * 60), now)).toEqual([]);
  });

  it('antwortet „unbekannt“, wenn der Server nicht kann', async () => {
    const fail = vi.fn(async () => new Response('x', { status: 501 }));
    expect(await createLifts('https://w', fail as unknown as typeof fetch)(['A', 'B'])).toEqual([null, null]);
  });
});
