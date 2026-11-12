import { describe, expect, it } from 'vitest';
import { AQ_GRID, AQ_VARS, airQualityGrid, aqLocations, aqSample, aqUrls } from './airquality';
import { AQ_SPECS, aqClass, aqScale, renderAq } from '../../render/gl/airquality';
import { sampleScale } from '../../core/color';

const tiny = { lon0: 10, lat0: 50, step: 1, nx: 2, ny: 2 };
// shape of a real Open-Meteo multi-location answer (current block), values shortened
const loc = (aqi: number | null, birch: number | null) => ({
  latitude: 50, longitude: 10, current_units: { time: 'iso8601' },
  current: { time: '2026-11-11T17:00', interval: 3600, european_aqi: aqi, pm10: 26.2, pm2_5: 23.2, nitrogen_dioxide: 48.2, ozone: 8, alder_pollen: 0, birch_pollen: birch, grass_pollen: 0, mugwort_pollen: 0, olive_pollen: 0, ragweed_pollen: 0 },
});

describe('air quality grid', () => {
  it('lists nodes south to north and splits into requests of at most 100 locations', () => {
    const l = aqLocations();
    expect(l).toHaveLength(AQ_GRID.nx * AQ_GRID.ny);
    expect(l[0]).toEqual({ lat: 33, lon: -24 });
    const u = aqUrls(100);
    expect(u.reduce((s, x) => s + x.locations, 0)).toBe(l.length);
    expect(u.every((x) => x.locations <= 100)).toBe(true);
    expect(u[0]!.url).toContain('current=' + AQ_VARS.join(','));
  });
  it('assembles chunks, keeps null as NaN, takes the model time', () => {
    const g = airQualityGrid([[loc(50, 3), loc(null, null)], [loc(70, 0), loc(40, null)]], tiny);
    expect(g.time).toBe(Date.UTC(2026, 10, 11, 17));
    expect(g.vars.european_aqi[0]).toBe(50);
    expect(Number.isNaN(g.vars.european_aqi[1]!)).toBe(true);
    expect(() => airQualityGrid([[loc(1, 1)]], tiny)).toThrow();
  });
  it('samples bilinear and refuses holes and the outside', () => {
    const g = airQualityGrid([[loc(0, 0), loc(20, 0), loc(40, 0), loc(60, 0)]], tiny);
    expect(aqSample(g, 'european_aqi', 10.5, 50.5)).toBeCloseTo(30, 6);
    expect(aqSample(g, 'european_aqi', 12, 50)).toBeUndefined();
    const h = airQualityGrid([[loc(0, 0), loc(20, 0), loc(40, 0), loc(null, 0)]], tiny);
    expect(aqSample(h, 'european_aqi', 10.5, 50.5)).toBeUndefined();
  });
});

describe('classes and image', () => {
  it('classifies with the EEA limits', () => {
    expect(aqClass(AQ_SPECS.european_aqi, 19)).toBe(0);
    expect(aqClass(AQ_SPECS.european_aqi, 20)).toBe(1);
    expect(aqClass(AQ_SPECS.european_aqi, 150)).toBe(5);
    expect(aqClass(AQ_SPECS.birch_pollen, 0)).toBe(0);
  });
  it('pollen is see-through at 0, the index is not', () => {
    expect(sampleScale(aqScale(AQ_SPECS.birch_pollen), 0)[3]).toBe(0);
    expect(sampleScale(aqScale(AQ_SPECS.european_aqi), 10)[3]).toBeGreaterThan(100);
  });
  it('renders pixels inside the grid and nothing at NaN nodes', () => {
    const g = airQualityGrid([[loc(10, 0), loc(10, 0), loc(10, 0), loc(10, 0)]], { lon0: 10, lat0: 50, step: 5, nx: 2, ny: 2 });
    const { px, w, h } = renderAq(g, 'european_aqi');
    expect(px.length).toBe(w * h * 4);
    expect(px[(Math.floor(h / 2) * w + Math.floor(w / 2)) * 4 + 3]).toBeGreaterThan(50);
  });
});
