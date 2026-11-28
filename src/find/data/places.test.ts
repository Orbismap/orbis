import { describe, expect, it } from 'vitest';
import { tilePosition } from '@/data/tilePoints';
import { BIKE_PARKING, HOSPITAL } from './kinds';
import { MAX_RING, coveredRadius, ringTiles, searchPlaces, withOwn } from './places';

const AT: [number, number] = [13.4, 52.52];
const [X, Y] = tilePosition(AT[0], AT[1], 14).map(Math.floor) as [number, number];
const point = (id: number, lng: number, lat: number, properties = {}) => ({ lng, lat, properties: { id, ...properties } });

describe('places around a position', () => {
  it('lists the tiles of a ring', () => {
    expect(ringTiles(5, 5, 0, 14)).toEqual([[5, 5]]);
    expect(ringTiles(5, 5, 1, 14)).toHaveLength(8);
    expect(ringTiles(5, 5, 2, 14)).toHaveLength(16);
    expect(ringTiles(0, 0, 1, 1)).toContainEqual([1, 0]); // wraps around the date line, never above the pole
    expect(ringTiles(0, 0, 1, 1).every(([, y]) => y >= 0)).toBe(true);
  });

  it('covers more with every ring', () => {
    expect(coveredRadius(AT, 1, 14)).toBeGreaterThan(1400);
    expect(coveredRadius(AT, 2, 14)).toBeGreaterThan(coveredRadius(AT, 1, 14));
  });

  it('stops after the 3 x 3 tiles when something is near, and leaves out private ones', async () => {
    const read: string[] = [];
    const found = await searchPlaces(BIKE_PARKING, AT, async (x, y) => {
      read.push(`${x}/${y}`);
      return x === X && y === Y ? [point(1, 13.4005, 52.52), point(2, 13.4001, 52.52, { access: 'private' }), point(1, 13.4005, 52.52)] : [];
    });
    expect(read).toHaveLength(9);
    expect(found.places.map((p) => p.key)).toEqual(['n1']);
  });

  it('searches further out until something turns up, and gives up after the last ring', async () => {
    let calls = 0;
    const far = await searchPlaces(BIKE_PARKING, AT, async (x) => (calls++, x === X + 3 ? [point(3, 13.46, 52.52)] : []));
    expect(far.places).toHaveLength(1);
    expect(calls).toBeGreaterThan(25);
    calls = 0;
    const none = await searchPlaces(BIKE_PARKING, AT, async () => (calls++, []));
    expect(none.places).toEqual([]);
    expect(calls).toBe((2 * MAX_RING + 1) ** 2);
  });

  it('searches further for what lies far apart, and does not take a practice for a hospital', async () => {
    let calls = 0;
    await searchPlaces(HOSPITAL, AT, async () => (calls++, []));
    expect(calls).toBe(17 ** 2);
    expect(HOSPITAL.place({ class: 'hospital', subclass: 'clinic' }, 1, 2)).toBeNull();
    expect(HOSPITAL.place({ class: 'hospital', subclass: 'hospital', name: 'Helios' }, 1, 2)).toMatchObject({ title: 'Helios', detail: 'Krankenhaus' });
  });

  it('describes a parking', () => {
    expect(BIKE_PARKING.place({ id: 5, osm: 'w', type: 'stands', capacity: 12, covered: 'yes' }, 1, 2)).toMatchObject({ key: 'w5', title: 'Anlehnbügel', detail: '12 Plätze · überdacht' });
    expect(BIKE_PARKING.place({ id: 6, name: 'Radhaus', type: 'building', fee: 'yes' }, 1, 2)).toMatchObject({ title: 'Radhaus', detail: 'Fahrradparkhaus · überdacht · gebührenpflichtig' });
    expect(BIKE_PARKING.place({ id: 7, access: 'customers' }, 1, 2)).toBeNull();
  });
});

describe('own entries', () => {
  const entry = (id: number, lat: number) => ({ set: 'fahrradparken', lng: 8, lat, properties: { id }, at: 0 });

  it('joins those nearby that the data do not carry yet', () => {
    const known = BIKE_PARKING.place({ id: 1 }, 8, 50)!;
    const merged = withOwn(BIKE_PARKING, [known], [entry(1, 50), entry(2, 50.001), entry(3, 51)], [8, 50]);
    expect(merged.map((p) => p.key)).toEqual(['n1', 'n2']);
  });

  it('leaves the list as it is without any', () => {
    const found = [BIKE_PARKING.place({ id: 1 }, 8, 50)!];
    expect(withOwn(BIKE_PARKING, found, [entry(1, 50)], [8, 50])).toBe(found);
    expect(withOwn(BIKE_PARKING, found, [entry(2, 50)], null)).toBe(found);
  });
});
