import { describe, expect, it } from 'vitest';
import type { OwxField } from '../../data/owx/decode';
import { cityOutlook, conditionOf, isDaylight, sampleCity, type CityFields } from './cityweather';

/** A constant global field (2 x 3 cells, 3 time steps) with the given physical value per time step. */
const constant = (vals: number[], scale = 0.1): OwxField => {
  const ny = 3, nx = 4, nt = vals.length;
  const data = new Int16Array(nt * ny * nx);
  for (let t = 0; t < nt; t++) data.fill(Math.round(vals[t]! / scale), t * ny * nx, (t + 1) * ny * nx);
  return { header: { var: 'x', nt, ny, nx, lat0: 90, lon0: -180, dx: 90, dy: 90, wrap: true, scale, offset: 0, nodata: -32768 }, data };
};

describe('conditionOf', () => {
  it('prefers precipitation, then cloud cover, day and night', () => {
    expect(conditionOf(100, 1, 5, true)).toBe('rain');
    expect(conditionOf(100, 1, -2, true)).toBe('snow');
    expect(conditionOf(5, 0, 20, true)).toBe('clear');
    expect(conditionOf(5, 0, 20, false)).toBe('clear-night');
    expect(conditionOf(40, 0, 20, true)).toBe('partly');
    expect(conditionOf(90, 0.05, 20, true)).toBe('cloud');
  });
});

describe('isDaylight', () => {
  it('is day at local noon and night at local midnight', () => {
    const noon = Date.UTC(2026, 5, 21, 12, 0);
    expect(isDaylight(0, 50, noon)).toBe(true);
    expect(isDaylight(0, 50, noon + 12 * 3_600_000)).toBe(false);
    expect(isDaylight(0, 80, Date.UTC(2026, 11, 21, 12, 0))).toBe(false); // polar night
  });
});

describe('city outlook', () => {
  const t0 = Date.UTC(2026, 10, 11, 0, 0);
  const times = Array.from({ length: 9 }, (_, i) => t0 + i * 3 * 3_600_000); // 24 h, 3-hourly
  const f: CityFields = {
    t: constant([2, 3, 6, 9, 8, 5, 3, 2, 1]),
    cloud: constant(times.map(() => 90)),
    precip: constant(times.map((_, i) => (i === 4 ? 2 : 0)), 0.01),
    u: constant(times.map(() => 3)),
    v: constant(times.map(() => 4)),
  };
  it('samples the current values (wind from u, v in km/h)', () => {
    const s = sampleCity(f, times, t0 + 3 * 3_600_000, 0, 0)!;
    expect(s.t).toBeCloseTo(3, 5);
    expect(s.wind).toBeCloseTo(5 * 3.6, 5);
  });
  it('gives min, max, wind and precipitation of the day', () => {
    const o = cityOutlook(f, times, t0, 0, 0, 2);
    expect(o).toHaveLength(2);
    expect(o[0]!.min).toBeCloseTo(2, 5);
    expect(o[0]!.max).toBeCloseTo(9, 5);
    expect(o[0]!.wind).toBeCloseTo(18, 5);
    expect(o[0]!.precip).toBeCloseTo(6, 5); // 2 mm/h × 3 h
  });
});
