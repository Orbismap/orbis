import { describe, expect, it } from 'vitest';
import type { Vec3 } from './frame';
import { frame, H, TO_CENTRE, W } from './testcamera';
import { globeness, latScale, mapZoomFor, placeAhead, sightToObject, slerp, solveCamera } from './follow-math';

/** How far from the middle of the screen the object is, with the camera for a distance zoom (centre on the ground, no elevation). */
function missFor(p: Vec3, dz: number, pitch: number, bearing: number) {
  const { centre, zoom, t } = solveCamera(p, bearing, pitch, dz, TO_CENTRE);
  const s = frame(zoom, t, centre[0], centre[1], pitch, bearing, 0).toScreen(p[0], p[1], p[2]);
  expect(s).not.toBeNull();
  return { miss: Math.hypot(s![0] - W / 2, s![1] - H / 2), t };
}

describe('placeAhead', () => {
  it('goes north and east along the equator', () => {
    expect(placeAhead(0, 0, 0, 0.5)[1]).toBeCloseTo((0.5 * 180) / Math.PI);
    expect(placeAhead(0, 0, 90, 0.5)[0]).toBeCloseTo((0.5 * 180) / Math.PI);
  });

  it('stays put without an angle', () => {
    const [lon, lat] = placeAhead(13.4, 52.5, 77, 0);
    expect(lon).toBeCloseTo(13.4);
    expect(lat).toBeCloseTo(52.5);
  });
});

describe('sightToObject', () => {
  it('straight down it is the altitude', () => {
    expect(sightToObject(6371008.8, 0)).toBeCloseTo(1);
  });

  it('nothing on the ground', () => {
    expect(sightToObject(0, 45)).toBeCloseTo(0);
  });
});

describe('the aircraft stays in the middle of the screen', () => {
  it('on the globe, from every side', () => {
    for (const pitch of [0, 30, 60, 85]) {
      for (const bearing of [0, 45, 135, -90]) {
        const r = missFor([13.4, 52.5, 11000], 8, pitch, bearing);
        expect(r.t).toBe(1);
        expect(r.miss).toBeLessThan(0.01);
      }
    }
  });

  it('on the flat map, with the centre on the ground', () => {
    for (const pitch of [0, 45, 60, 80]) {
      const r = missFor([13.4, 52.5, 500], 16, pitch, 30);
      expect(r.t).toBe(0);
      expect(r.miss).toBeLessThan(0.01);
    }
  });

  it('in the blend, at t = 0.25, 0.5 and 0.75 (1 px at most)', () => {
    const p: Vec3 = [13.4, 52.5, 3000];
    for (const want of [0.25, 0.5, 0.75]) {
      // the distance zoom that gives about that t
      let best = { miss: 99, t: -1 };
      for (let dz = 9; dz < 16; dz += 0.01) {
        const r = missFor(p, dz, 60, 30);
        if (best.t < 0 || Math.abs(r.t - want) < Math.abs(best.t - want)) best = r;
      }
      expect(Math.abs(best.t - want)).toBeLessThan(0.02);
      expect(best.miss).toBeLessThan(1);
    }
  });
});

describe('slerp', () => {
  it('runs along the great circle between two places', () => {
    expect(slerp([0, 0], [90, 0], 0.5)[0]).toBeCloseTo(45);
    expect(slerp([10, 50], [10, 50], 0.3)).toEqual([10, 50]);
  });
});

describe('globeness', () => {
  it('is MapLibre\'s projection expression: 1 up to zoom 11, linear to 0 at zoom 12', () => {
    expect(globeness(3)).toBe(1);
    expect(globeness(11)).toBe(1);
    expect(globeness(11.25)).toBeCloseTo(0.75);
    expect(globeness(11.5)).toBeCloseTo(0.5);
    expect(globeness(12)).toBe(0);
    expect(globeness(16)).toBe(0);
  });
});

describe('solveCamera', () => {
  const p: Vec3 = [13.4, 52.5, 3000];
  const [pitch, bearing] = [60, 30];
  const solve = (dz: number) => solveCamera(p, bearing, pitch, dz, TO_CENTRE);

  it('knows its t from the zoom it sets', () => {
    for (let dz = 8; dz < 16; dz += 0.1) {
      const { zoom, t } = solve(dz);
      expect(t).toBe(globeness(zoom));
    }
  });

  it('grows with the distance zoom, without a jump, also across the blend', () => {
    let prev = solve(6).zoom;
    for (let dz = 6.005; dz < 16; dz += 0.005) {
      const { zoom } = solve(dz);
      expect(zoom).toBeGreaterThan(prev - 1e-9);
      expect(zoom - prev).toBeLessThan(0.02);
      prev = zoom;
    }
  });

  it('moves the centre continuously across the blend', () => {
    let prev = solve(10).centre;
    for (let dz = 10.005; dz < 15; dz += 0.005) {
      const c = solve(dz).centre;
      // metres: all of it is a few metres, no flip between two states
      expect(Math.hypot(c[0] - prev[0], c[1] - prev[1])).toBeLessThan(1e-4);
      prev = c;
    }
  });

  it('keeps the aircraft in the middle on the way through, at t = 1, in the blend and flat', () => {
    const seen = new Set<string>();
    for (let dz = 9; dz < 16; dz += 0.05) {
      const { zoom, t, centre } = solve(dz);
      const s = frame(zoom, t, centre[0], centre[1], pitch, bearing, 0).toScreen(p[0], p[1], p[2]);
      expect(Math.hypot(s![0] - W / 2, s![1] - H / 2)).toBeLessThan(1);
      seen.add(t === 1 ? 'globe' : t === 0 ? 'flat' : 'blend');
    }
    expect([...seen].sort()).toEqual(['blend', 'flat', 'globe']);
  });

  it('cannot get nearer than the ground point allows (zoom stays below the blend for a high aircraft)', () => {
    const { zoom } = solveCamera([13.4, 52.5, 11000], 30, 60, 18, TO_CENTRE);
    expect(zoom).toBeLessThan(12);
  });

  it('puts the mapped zoom where the distance to the aircraft says', () => {
    const { zoom } = solve(12.5);
    expect(zoom).toBeCloseTo(mapZoomFor(12.5, p[2], pitch, 1, TO_CENTRE) + latScale(solve(12.5).centre[1]), 9);
  });
});
