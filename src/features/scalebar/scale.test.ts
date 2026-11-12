import { describe, expect, it } from 'vitest';
import { fit, scaleModel, SCALE_UNITS } from './scale';

const km = (m: number) => scaleModel(m, SCALE_UNITS.km, 10)!;
const mi = (m: number) => scaleModel(m, SCALE_UNITS.mi, 10)!;
const total = (s: { seg: number; n: number }) => s.seg * s.n;

describe('scale bar unit and step', () => {
  it('uses metres below 1 km', () => {
    const a = km(30);
    expect(a.label).toBe('m');
    expect(total(a)).toBeLessThanOrEqual(30);
    const b = km(500);
    expect(b.label).toBe('m');
    expect(total(b)).toBe(500);
  });
  it('a 1 km bar reads in km, a shorter one in m', () => {
    expect(km(1200).label).toBe('km');
    expect(total(km(1200))).toBe(1);
    expect(km(950).label).toBe('m');
  });
  it('uses kilometres from 1 km up', () => {
    const a = km(2000);
    expect(a.label).toBe('km');
    expect(total(a)).toBeLessThanOrEqual(2);
    const b = km(1_000_000);
    expect(b.label).toBe('km');
    expect(total(b)).toBe(1000);
  });
  it('imperial: feet below 1 mile, miles above', () => {
    expect(mi(100).label).toBe('ft');
    expect(mi(1000).label).toBe('ft');
    expect(mi(5000).label).toBe('mi');
    expect(mi(1_000_000).label).toBe('mi');
  });
  it('bar width stays within the measuring span', () => {
    for (const m of [30, 500, 2000, 1e6]) expect(km(m).width).toBeLessThanOrEqual(170 + 1e-6);
    expect(fit(100).seg).toBeGreaterThan(0);
  });
});
