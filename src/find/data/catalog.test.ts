import { describe, expect, it } from 'vitest';
import { ART } from './art';
import { CATALOG } from './catalog';
import { BIKE_PARKING } from './kinds';

const entries = CATALOG.flatMap((g) => g.entries);

describe('catalogue', () => {
  it('has one entry per picture, with a picture each', () => {
    expect(entries.map((e) => e.art).sort()).toEqual(Object.keys(ART).sort());
  });

  it('offers only what can be searched for: bicycle parking so far', () => {
    expect(entries.filter((e) => e.kind).map((e) => e.name)).toEqual(['Fahrradständer']);
  });
});

describe('form pictures', () => {
  it('draws every choice of a pictured field, with sound numbers', () => {
    const pictured = BIKE_PARKING.add!.fields.filter((f) => f.pictures);
    expect(pictured.map((f) => f.key)).toEqual(['bicycle_parking']);
    for (const field of pictured) {
      for (const [value] of field.options!) {
        const art = field.pictures!.art[value]!;
        expect(art, value).toContain('<path');
        expect(art, value).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  });
});
