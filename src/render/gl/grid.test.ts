import { describe, expect, it } from 'vitest';
import { TEMPERATURE } from '../../core/color';
import type { OwxField } from '../../data/owx/decode';
import {
  bracketTime, combine, latToMerc, lngToMerc, mercToLat, mercToLng, relativeHumidity, runNote, sampleGrid, sampleLevels, tileAt, tileOrigin, tilesForViewport, windKmh,
} from './grid';
import { buildFieldLut } from './scales';

const NODATA = -32768;

/** 2 time steps of a small global grid (wrap) with values q = base + x*10 + y*100, scale 0.1. */
function grid(nt: number, ny: number, nx: number, f: (t: number, y: number, x: number) => number, extra: Partial<OwxField['header']> = {}): OwxField {
  const data = new Int16Array(nt * ny * nx);
  for (let t = 0; t < nt; t++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) data[(t * ny + y) * nx + x] = f(t, y, x);
  return { header: { var: 'x', nt, ny, nx, lat0: 90, lon0: -180, dx: 0.5, dy: 0.5, wrap: true, scale: 0.1, offset: 0, nodata: NODATA, ...extra }, data };
}

describe('bracketTime', () => {
  const times = [0, 3, 6, 9];
  it('finds the steps and the weight', () => {
    expect(bracketTime(times, 4.5)).toEqual({ i0: 1, i1: 2, f: 0.5 });
    expect(bracketTime(times, 3)).toEqual({ i0: 1, i1: 2, f: 0 });
  });
  it('clamps outside the range', () => {
    expect(bracketTime(times, -5)).toEqual({ i0: 0, i1: 0, f: 0 });
    expect(bracketTime(times, 99)).toEqual({ i0: 3, i1: 3, f: 0 });
    expect(bracketTime([5], 7)).toEqual({ i0: 0, i1: 0, f: 0 });
  });
});

describe('sampleGrid', () => {
  // 4 x 3 global grid at 0.5°? use dx=90 so that the numbers are readable: nx=4 (wrap), ny=3 (lat 90, 0, -90)
  const f = grid(2, 3, 4, (t, y, x) => 100 * t + 10 * x + y, { dx: 90, dy: 90 });
  it('is exact on grid points and bilinear between', () => {
    expect(sampleGrid(f, { i0: 0, i1: 0, f: 0 }, -180, 90)).toBeCloseTo(0, 6);
    expect(sampleGrid(f, { i0: 0, i1: 0, f: 0 }, -90, 0)).toBeCloseTo((10 + 1) * 0.1, 6);
    expect(sampleGrid(f, { i0: 0, i1: 0, f: 0 }, -135, 90)).toBeCloseTo(5 * 0.1, 6);
    expect(sampleGrid(f, { i0: 0, i1: 0, f: 0 }, -90, 45)).toBeCloseTo((10 + 0.5) * 0.1, 6);
  });
  it('blends linearly in time', () => {
    expect(sampleGrid(f, { i0: 0, i1: 1, f: 0.25 }, -90, 0)).toBeCloseTo((11 + 25) * 0.1, 6);
  });
  it('wraps across the antimeridian on global grids', () => {
    // between x=3 (lon 90) and x=0 (lon 180 = -180)
    expect(sampleGrid(f, { i0: 0, i1: 0, f: 0 }, 135, 90)).toBeCloseTo(((30 + 0) / 2) * 0.1, 6);
    expect(sampleGrid(f, { i0: 0, i1: 0, f: 0 }, 135 - 360, 90)).toBeCloseTo(1.5, 6);
    expect(sampleGrid(f, { i0: 0, i1: 0, f: 0 }, 135 + 360, 90)).toBeCloseTo(1.5, 6);
  });
  it('leaves nodata corners out of the weights, and is undefined when all are nodata', () => {
    const g = grid(1, 3, 4, (_t, y, x) => (x === 1 && y === 0 ? NODATA : 50), { dx: 90, dy: 90 });
    // cell between x=0,1 and y=0,1: one corner missing → the other three (all 50) decide
    expect(sampleGrid(g, { i0: 0, i1: 0, f: 0 }, -135, 45)).toBeCloseTo(5, 6);
    const none = grid(1, 3, 4, () => NODATA, { dx: 90, dy: 90 });
    expect(sampleGrid(none, { i0: 0, i1: 0, f: 0 }, 0, 0)).toBeUndefined();
  });
  it('treats a corner as missing when either time step lacks data', () => {
    const g = grid(2, 3, 4, (t, y, x) => (t === 1 && x === 0 && y === 0 ? NODATA : 20), { dx: 90, dy: 90 });
    expect(sampleGrid(g, { i0: 0, i1: 1, f: 0.5 }, -180, 90)).toBeUndefined();
    expect(sampleGrid(g, { i0: 0, i1: 1, f: 0.5 }, -135, 90)).toBeCloseTo(2, 6);
  });
  it('tiles do not wrap: outside the tile is undefined, the overlap cell is sampled', () => {
    // tile at lon0 = 0, lat0 = 90, 0.125°, 361 x 361 → only check a tiny 3x3 stand-in with dx = 15 (45° = 3 cells + overlap)
    const t = grid(1, 4, 4, (_t, y, x) => 10 * x + y, { lon0: 0, lat0: 90, dx: 15, dy: 15, wrap: false });
    expect(sampleGrid(t, { i0: 0, i1: 0, f: 0 }, 45, 45)).toBeCloseTo(3.3, 6); // x=3 (overlap column), y=3
    expect(sampleGrid(t, { i0: 0, i1: 0, f: 0 }, 46, 80)).toBeUndefined();
    expect(sampleGrid(t, { i0: 0, i1: 0, f: 0 }, -1, 80)).toBeUndefined();
    expect(sampleGrid(t, { i0: 0, i1: 0, f: 0 }, 20, 91)).toBeUndefined();
  });
});

describe('sampleLevels and derived fields', () => {
  it('prefers the first level that has data and derives magnitude and humidity', () => {
    const u = grid(1, 3, 4, () => 30, { dx: 90, dy: 90 }); // 3 m/s
    const v = grid(1, 3, 4, () => 40, { dx: 90, dy: 90 }); // 4 m/s
    const lv = { fields: [u, v], header: u.header };
    expect(sampleLevels([lv], 'magnitude', { i0: 0, i1: 0, f: 0 }, 10, 10)).toBeCloseTo(5 * 3.6, 6);
    expect(sampleLevels([], 'value', { i0: 0, i1: 0, f: 0 }, 10, 10)).toBeUndefined();
    expect(sampleLevels([lv], 'value', { i0: 0, i1: 0, f: 0 }, 10, 10)).toBeCloseTo(3, 6);
  });
  it('humidity: dew point equals temperature at saturation, drops when drier', () => {
    expect(relativeHumidity(15, 15)).toBeCloseTo(100, 5);
    expect(relativeHumidity(20, 10)).toBeGreaterThan(45);
    expect(relativeHumidity(20, 10)).toBeLessThan(55);
    expect(relativeHumidity(20, 25)).toBe(100);
    expect(combine('humidity', 30, 10)).toBeCloseTo(relativeHumidity(30, 10), 8);
    expect(windKmh(3, 4)).toBeCloseTo(18, 8);
  });
});

describe('tiles', () => {
  it('tileAt / tileOrigin', () => {
    expect(tileAt(13.4, 52.5)).toEqual({ c: 4, r: 0 });
    expect(tileAt(-179.9, -80)).toEqual({ c: 0, r: 3 });
    expect(tileAt(180, 0)).toEqual({ c: 0, r: 2 });
    expect(tileOrigin({ c: 4, r: 1 })).toEqual({ lon0: 0, lat0: 45 });
  });
  it('selects the tiles of a viewport, nearest first, capped', () => {
    const t = tilesForViewport([5, 44, 15, 52], { lng: 10, lat: 48 }, 6);
    expect(t.map((x) => `${x.c}_${x.r}`).sort()).toEqual(['4_0', '4_1']);
    const wide = tilesForViewport([-20, 30, 60, 60], { lng: 10, lat: 40 }, 4);
    expect(wide).toHaveLength(4);
    expect(wide[0]).toEqual({ c: 4, r: 1 });
  });
  it('handles viewports across the antimeridian and beyond ±180', () => {
    const t = tilesForViewport([170, -10, 190, 10], { lng: 180, lat: 0 }, 6);
    expect(t.map((x) => `${x.c}_${x.r}`).sort()).toEqual(['0_1', '0_2', '7_1', '7_2']);
    const t2 = tilesForViewport([-200, -10, -170, 10], { lng: -185, lat: 0 }, 6);
    expect(t2.map((x) => `${x.c}_${x.r}`).sort()).toEqual(['0_1', '0_2', '7_1', '7_2']);
  });
  it('a world-wide viewport returns the nearest tiles to the centre', () => {
    const t = tilesForViewport([-180, -85, 180, 85], { lng: 10, lat: 50 }, 4);
    expect(t).toHaveLength(4);
    expect(t[0]).toEqual({ c: 4, r: 0 });
  });
});

describe('geometry and lut', () => {
  it('mercator conversions round-trip', () => {
    for (const lat of [-80, -45, 0, 33, 70]) expect(mercToLat(latToMerc(lat))).toBeCloseTo(lat, 8);
    expect(mercToLng(lngToMerc(13.4))).toBeCloseTo(13.4, 10);
    expect(mercToLat(0.5)).toBeCloseTo(0, 10);
  });
  it('builds a premultiplied 1024 px table over the scale range', () => {
    const lut = buildFieldLut(TEMPERATURE);
    expect(lut.length).toBe(1024 * 4);
    // fully opaque stops stay as they are, premultiplication does not change them
    expect(lut[3]).toBe(255);
    const faded = buildFieldLut({ stops: [[0, 'rgba(255, 0, 0, 0)'], [1, 'rgba(255, 0, 0, 1)']] }, 5);
    expect(faded[3]).toBe(0);
    expect(faded[0]).toBe(0); // transparent start: premultiplied colour is 0
    expect(faded[4 * 4 + 3]).toBe(255);
    expect(faded[2 * 4]).toBe(faded[2 * 4 + 3]); // red == alpha when premultiplied
  });
  it('runNote reads like "ICON-Lauf 10. Nov., 12 UTC"', () => {
    expect(runNote(Date.UTC(2026, 10, 10, 12))).toMatch(/^ICON-Lauf 10\. Nov\.?, 12 UTC$/);
  });
});
