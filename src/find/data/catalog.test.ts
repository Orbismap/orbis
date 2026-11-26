import { describe, expect, it } from 'vitest';
import { ART } from './art';
import { CATALOG } from './catalog';
import { BIKE_PARKING, KINDS } from './kinds';

const entries = CATALOG.flatMap((g) => g.entries);

describe('catalogue', () => {
  it('has one entry per picture, with a picture each', () => {
    expect(entries.map((e) => e.art).sort()).toEqual(Object.keys(ART).sort());
  });

  it('offers every kind once, under its name', () => {
    expect(entries.flatMap((e) => (e.kind ? [e.kind.id] : [])).sort()).toEqual(KINDS.map((k) => k.id).sort());
    for (const e of entries) if (e.kind) expect(e.kind.name).toBe(e.name);
  });

  it('announces what has no data yet', () => {
    expect(entries.filter((e) => !e.kind).map((e) => e.name)).toEqual(['Reparatur und Luft', 'Defibrillator']);
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
