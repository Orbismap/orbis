import { describe, expect, it } from 'vitest';
import { shapeOf, treeHeight, unit } from './baeume';

describe('tree shapes', () => {
  it('gives the same number for the same id and spreads over 0..1', () => {
    expect(unit('123')).toBe(unit('123'));
    expect(unit('123')).not.toBe(unit('124'));
    const values = Array.from({ length: 500 }, (_, i) => unit(String(i)));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(values.filter((v) => v < 0.5).length).toBeGreaterThan(200);
  });

  it('turns conifers into conifers and broadleaf trees into varied crowns', () => {
    expect(shapeOf({ id: '1', leafType: 'needleleaved' })).toBe('nadel');
    const shapes = new Set(Array.from({ length: 60 }, (_, i) => shapeOf({ id: String(i), leafType: 'broadleaved' })));
    expect(shapes).toEqual(new Set(['rund', 'oval', 'breit']));
    expect(shapeOf({ id: '7' })).toBe(shapeOf({ id: '7' }));
  });

  it('guesses the height when it is not tagged and keeps it sensible', () => {
    expect(treeHeight({ heightM: 15 })).toBe(15);
    expect(treeHeight({})).toBe(9);
    expect(treeHeight({ leafType: 'needleleaved' })).toBe(12);
    expect(treeHeight({ circumferenceM: 2 })).toBe(14);
    expect(treeHeight({ heightM: 300 })).toBe(40);
    expect(treeHeight({ heightM: 0.2 })).toBe(2);
  });
});
