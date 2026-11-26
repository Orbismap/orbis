import { createExpression, featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { PARKING_COLORS, parkingCard, parkingColor, parkingCountKey, parkingFilter, parkingOsmUrl, parkingType, type BikeParkingProps } from './bikeparking';

const point = (properties: Partial<BikeParkingProps>) => ({ type: 'Point' as const, properties: { id: 1, ...properties } });
const passes = (o: Parameters<typeof parkingFilter>[0], p: Partial<BikeParkingProps>) =>
  featureFilter(parkingFilter(o), 'layers[0].filter').filter({ zoom: 15 }, point(p) as never);
const colorOf = (p: Partial<BikeParkingProps>) => {
  const e = createExpression(parkingColor, 'layers[0].paint.circle-color');
  if (e.result !== 'success') throw new Error('invalid expression');
  return e.value.evaluate({ zoom: 15 }, point(p) as never);
};

describe('bicycle parking', () => {
  it('colours by roof, roofed types count without a tag', () => {
    expect(colorOf({ covered: 'yes' })).toBe(PARKING_COLORS.covered);
    expect(colorOf({ type: 'lockers' })).toBe(PARKING_COLORS.covered);
    expect(colorOf({ type: 'shed', covered: 'no' })).toBe(PARKING_COLORS.open);
    expect(colorOf({ type: 'stands' })).toBe(PARKING_COLORS.unknown);
    expect(colorOf({ covered: 'partial' })).toBe(PARKING_COLORS.unknown);
    expect(colorOf({})).toBe(PARKING_COLORS.unknown);
  });

  it('has no filter while no option is set', () => {
    expect(parkingFilter({ covered: false, public: false, capacity: '0' })).toBeUndefined();
  });

  it('filters by roof, access and capacity together', () => {
    expect(passes({ covered: true }, { covered: 'yes' })).toBe(true);
    expect(passes({ covered: true }, { type: 'building' })).toBe(true);
    expect(passes({ covered: true }, { covered: 'partial' })).toBe(false);
    expect(passes({ public: true }, {})).toBe(true);
    expect(passes({ public: true }, { access: 'permissive' })).toBe(true);
    expect(passes({ public: true }, { access: 'customers' })).toBe(false);
    expect(passes({ capacity: '10' }, { capacity: 10 })).toBe(true);
    expect(passes({ capacity: '10' }, { capacity: 9 })).toBe(false);
    expect(passes({ capacity: '10' }, {})).toBe(false);
    expect(passes({ covered: true, capacity: '10' }, { covered: 'yes', capacity: 4 })).toBe(false);
  });

  it('names the cluster counter of the options as the data repo does', () => {
    expect(parkingCountKey({ covered: false, public: false, capacity: '0' })).toBe('n');
    expect(parkingCountKey({ covered: true, public: false, capacity: '0' })).toBe('nc');
    expect(parkingCountKey({ covered: true, public: true, capacity: '10' })).toBe('ncp10');
    expect(parkingCountKey({ public: true, capacity: '50' })).toBe('np50');
  });

  it('makes a card from the tagged values only', () => {
    const card = parkingCard({ id: 7, type: 'stands', capacity: 1200, covered: 'no', access: 'customers', fee: 'no', cargo: 1 });
    expect(card.title).toBe('Fahrradständer');
    expect(card.subtitle).toBe('Anlehnbügel');
    expect(card.facts.map((f) => `${f.label}: ${f.value}`)).toEqual([
      'Stellplätze: 1.200', 'Überdacht: Nein', 'Zugang: Nur für Kundschaft', 'Gebühr: Kostenlos', 'Lastenräder: Eigene Plätze',
    ]);
    expect(parkingCard({ id: 8 }).facts).toEqual([]);
  });

  it('names unknown types and links the right OSM object', () => {
    expect(parkingType('lean_and_stick')).toBe('lean and stick');
    expect(parkingType(undefined)).toBe('Fahrradparkplatz');
    expect(parkingOsmUrl({ id: 5 })).toBe('https://www.openstreetmap.org/node/5');
    expect(parkingOsmUrl({ id: 5, osm: 'w' })).toBe('https://www.openstreetmap.org/way/5');
    expect(parkingOsmUrl({ id: 5, osm: 'r' })).toBe('https://www.openstreetmap.org/relation/5');
  });
});
