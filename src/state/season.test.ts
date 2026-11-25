import { describe, expect, it } from 'vitest';
import { seasonBlend, seasonDate, seasonLabel, seasonPosOf } from './season';

describe('Jahreszeiten-Position', () => {
  it('Position im Jahr aus der Zeit', () => {
    expect(seasonPosOf(Date.UTC(2026, 0, 1))).toBe(0);
    expect(seasonPosOf(Date.UTC(2026, 6, 16, 12))).toBeCloseTo(6.5, 1);
  });
  it('mischt um die Monatsmitte der Bilder herum, auch über den Jahreswechsel', () => {
    expect(seasonBlend(6.5)).toEqual({ a: 6, b: 7, mix: 0 });
    expect(seasonBlend(7)).toEqual({ a: 6, b: 7, mix: 0.5 });
    const jan = seasonBlend(0.1);
    expect(jan.a).toBe(11);
    expect(jan.b).toBe(0);
    expect(jan.mix).toBeCloseTo(0.6, 5);
  });
  it('Monatsbilder: 8-Tage-Beginn nahe der Monatsmitte, zwölf verschiedene Daten', () => {
    expect(seasonDate(0)).toBe('2023-01-17');
    expect(seasonDate(11)).toBe('2023-12-19');
    expect(new Set(Array.from({ length: 12 }, (_, m) => seasonDate(m))).size).toBe(12);
  });
  it('Beschriftung', () => {
    expect(seasonLabel(6.5)).toBe('Mitte Juli');
    expect(seasonLabel(0)).toBe('Anfang Januar');
  });
});
