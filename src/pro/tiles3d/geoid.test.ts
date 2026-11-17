import { describe, expect, it } from 'vitest';
import { geoidHeight } from './geoid';

describe('geoidHeight (EGM96, 2° grid)', () => {
  it('matches known places to a few metres', () => {
    expect(geoidHeight(-74.04, 40.69)).toBeCloseTo(-33, -1); // New York
    expect(geoidHeight(139.7, 35.68)).toBeCloseTo(37, -1); // Tokyo
    expect(geoidHeight(13.4, 52.5)).toBeCloseTo(44, -1); // Berlin
    expect(geoidHeight(79, -2)).toBeLessThan(-90); // Indian Ocean low
  });
  it('wraps at the antimeridian and the poles', () => {
    expect(Number.isFinite(geoidHeight(179.9, 10))).toBe(true);
    expect(Number.isFinite(geoidHeight(-180, 90))).toBe(true);
    expect(Number.isFinite(geoidHeight(360.5, -90))).toBe(true);
  });
});
