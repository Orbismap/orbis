import { describe, expect, it, vi } from 'vitest';
import { createDbDelays, plannedJourney } from './delays';
import { modeGroup, motisModes } from './modes';
import { makeTime, named, parseDepartures, parseJourneys, parseStops, parseTrip } from './transitous';

const T = (min: number) => `2026-11-25T10:${String(min).padStart(2, '0')}:00Z`;
const itinerary = {
  startTime: T(7),
  endTime: T(40),
  transfers: 0,
  legs: [
    {
      mode: 'HIGHSPEED_RAIL',
      from: { name: 'Hamburg Hbf', track: '14', scheduledTrack: '12' },
      to: { name: 'Berlin Hbf', track: '3' },
      startTime: T(7),
      scheduledStartTime: T(5),
      endTime: T(40),
      scheduledEndTime: T(30),
      realTime: true,
      displayName: 'ICE 1601',
      headsign: 'Berlin',
      intermediateStops: [{ name: 'Hagenow', arrival: T(20), scheduledArrival: T(18) }],
    },
    { mode: 'WALK', from: { name: 'Berlin Hbf' }, to: { name: 'Ziel' }, startTime: T(40), endTime: T(50), distance: 420.4 },
  ],
};

describe('Transitous-Parser', () => {
  it('berechnet Verspätung nur mit Echtzeit', () => {
    expect(makeTime(T(7), T(5), true).delayMin).toBe(2);
    expect(makeTime(T(7), T(5), false)).toEqual({ planned: Date.parse(T(5)), actual: Date.parse(T(5)), delayMin: null });
  });

  it('liest Verbindungen mit Gleiswechsel, Zwischenhalten und Fußweg', () => {
    const [j] = parseJourneys([itinerary]);
    const [ride, walk] = j!.legs;
    expect(ride!.mode).toBe('fern');
    expect(ride!.line).toBe('ICE 1601');
    expect(ride!.from.platformChanged).toBe(true);
    expect(ride!.from.time.delayMin).toBe(2);
    expect(ride!.to.time.delayMin).toBe(10);
    expect(ride!.via[0]!.time.delayMin).toBe(2);
    expect(walk!.mode).toBe('fuss');
    expect(walk!.line).toBe('');
    expect(walk!.walkM).toBe(420);
    expect(j!.departure).toBe(ride!.from.time);
    expect(j!.arrival).toBe(walk!.to.time);
  });

  it('liest Abfahrten und verwirft solche ohne Zeit', () => {
    const list = parseDepartures([
      { mode: 'BUS', place: { departure: T(3), scheduledDeparture: T(1), track: 'B' }, realTime: true, displayName: '100', headsign: 'Zoo' },
      { mode: 'BUS', place: {} },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ mode: 'bus', line: '100', headsign: 'Zoo', platform: 'B' });
    expect(list[0]!.time.delayMin).toBe(2);
  });

  it('liest nur Haltestellen und wählt das Gebiet', () => {
    const stops = parseStops([
      { type: 'STOP', id: 'a', name: 'Hbf', lat: 1, lon: 2, areas: [{ name: 'Kreis', adminLevel: 6 }, { name: 'Stadt', adminLevel: 8 }] },
      { type: 'ADDRESS', id: 'b', name: 'Straße', lat: 0, lon: 0 },
    ]);
    expect(stops).toEqual([{ id: 'a', name: 'Hbf', lat: 1, lng: 2, area: 'Stadt' }]);
  });
});

describe('Modi', () => {
  it('ordnet MOTIS-Modi Gruppen zu', () => {
    expect(modeGroup('SUBURBAN')).toBe('sbahn');
    expect(modeGroup('FLEX')).toBe('bus');
    expect(modeGroup('WALK')).toBe('fuss');
    expect(modeGroup('???')).toBe('sonst');
    expect(motisModes(['ubahn', 'tram'])).toEqual(['SUBWAY', 'METRO', 'TRAM']);
  });
});

describe('DB-Verspätungen', () => {
  it('zeigt für Züge zuerst nur die Fahrplanzeit', () => {
    const [j] = parseJourneys([itinerary]);
    const p = plannedJourney(j!);
    expect(p.legs[0]!.from.time.delayMin).toBeNull();
    expect(p.legs[0]!.from.time.actual).toBe(Date.parse(T(5)));
    expect(p.departure).toBe(p.legs[0]!.from.time);
  });

  it('mischt Verspätung, Gleis und Ausfall ein', async () => {
    const [j] = parseJourneys([itinerary]);
    const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => {
      const { queries } = JSON.parse(String(init?.body)) as { queries: { kind: string }[] };
      const results = queries.map((q) => (q.kind === 'dep' ? { delayMin: 4, cancelled: false, track: '13', trackChanged: true } : null));
      return new Response(JSON.stringify({ results }));
    });
    const out = await createDbDelays({ baseUrl: 'https://w', fetchFn: fetchFn as unknown as typeof fetch }).journeys([plannedJourney(j!)]);
    const ride = out[0]!.legs[0]!;
    expect(out[0]!.delaySource).toBe('db');
    expect(ride.from.time).toMatchObject({ delayMin: 4, delaySource: 'db', actual: Date.parse(T(5)) + 4 * 60000 });
    expect(ride.from.platform).toBe('13');
    expect(ride.to.time.delayMin).toBeNull(); // Ankunft nicht gefunden: bleibt Fahrplan
  });

  it('pausiert nach einem Fehler und liefert die Eingabe zurück', async () => {
    const [j] = parseJourneys([itinerary]);
    const fetchFn = vi.fn(async () => new Response('x', { status: 501 }));
    const delays = createDbDelays({ baseUrl: 'https://w', fetchFn: fetchFn as unknown as typeof fetch });
    const list = [j!];
    expect(await delays.journeys(list)).toBe(list);
    expect(await delays.journeys(list)).toBe(list);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('Linienlauf und Verlauf', () => {
  // "_p~iF~ps|U_ulLnnqC" ist das Beispiel der Polyline-Beschreibung (Genauigkeit 5)
  const ride = (from: string, to: string) => ({ mode: 'REGIONAL_RAIL', from: { name: from, stopId: from }, to: { name: to, stopId: to }, startTime: T(1), endTime: T(9), tripId: 't1', legGeometry: { points: '_p~iF~ps|U_ulLnnqC', precision: 5 } });

  it('liest Verlauf, Fahrt- und Haltestellen-IDs', () => {
    const leg = parseJourneys([{ startTime: T(1), endTime: T(9), transfers: 0, legs: [ride('A', 'B')] }])[0]!.legs[0]!;
    expect(leg.tripId).toBe('t1');
    expect(leg.from.stopId).toBe('A');
    expect(leg.path).toEqual([[-120.2, 38.5], [-120.95, 40.7]]);
  });

  it('hängt durchgebundene Teilstücke aneinander', () => {
    const leg = parseTrip({ legs: [ride('A', 'B'), ride('B', 'C')] })!;
    expect([leg.from.name, ...leg.via.map((v) => v.name), leg.to.name]).toEqual(['A', 'B', 'C']);
    expect(leg.path).toHaveLength(4);
    expect(parseTrip({ legs: [] })).toBeUndefined();
  });

  it('nennt Start und Ziel an Koordinaten beim gewählten Namen', () => {
    const j = named(parseJourneys([{ startTime: T(1), endTime: T(9), transfers: 0, legs: [ride('START', 'END')] }])[0]!, 'Mein Standort', 'Wismar');
    expect([j.legs[0]!.from.name, j.legs[0]!.to.name]).toEqual(['Mein Standort', 'Wismar']);
  });
});
