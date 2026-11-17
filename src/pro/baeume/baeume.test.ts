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

  it('picks the model of the genus, whatever the leaf type says', () => {
    expect(shapeOf({ id: '1', genus: 'quercus', leafType: 'broadleaved' })).toBe('eiche');
    expect(shapeOf({ id: '1', genus: 'pinus' })).toBe('kiefer');
    expect(shapeOf({ id: '1', genus: 'thuja', leafType: 'needleleaved' })).toBe('zypresse');
    expect(shapeOf({ id: '1', genus: 'phoenix' })).toBe('palme');
    expect(shapeOf({ id: '1', genus: 'picea' })).toBe('nadel');
    expect(shapeOf({ id: '1', genus: 'unknownus', leafType: 'needleleaved' })).toBe('nadel');
  });

  it('makes bushes of hedges and keeps them low', () => {
    expect(shapeOf({ id: '1', hedge: true, genus: 'quercus' })).toBe('busch');
    expect(treeHeight({ hedge: true })).toBe(1.6);
    expect(treeHeight({ hedge: true, heightM: 0.1 })).toBe(0.5);
    expect(treeHeight({ hedge: true, heightM: 30 })).toBe(6);
  });

  it('guesses the height when it is not tagged and keeps it sensible', () => {
    expect(treeHeight({ heightM: 15 })).toBe(15);
    expect(treeHeight({})).toBe(9);
    expect(treeHeight({ leafType: 'needleleaved' })).toBe(12);
    expect(treeHeight({ circumferenceM: 2 })).toBe(14);
    expect(treeHeight({ genus: 'populus' })).toBe(18);
    expect(treeHeight({ genus: 'populus', heightM: 7 })).toBe(7);
    expect(treeHeight({ heightM: 300 })).toBe(40);
    expect(treeHeight({ heightM: 0.2 })).toBe(2);
  });
});
