import { describe, expect, it } from 'vitest';
import { clampCamera, clampPitch, ENGINE_MAX_PITCH, needsNorthReset, tiltAvailable, tiltLimit, wrapBearing } from './camera';

describe('tiltLimit', () => {
  it('has fixed end values', () => {
    expect(tiltLimit(-3)).toBe(0);
    expect(tiltLimit(0.5)).toBe(0);
    expect(tiltLimit(2)).toBe(0);
    expect(tiltLimit(12.5)).toBe(ENGINE_MAX_PITCH);
    expect(tiltLimit(19)).toBe(ENGINE_MAX_PITCH);
    expect(tiltLimit(NaN)).toBe(0);
  });
  it('is monotonic and continuous (small steps, small differences)', () => {
    let prev = tiltLimit(0);
    for (let z = 0.001; z <= 19; z += 0.001) {
      const v = tiltLimit(z);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(v - prev).toBeLessThan(0.2); // max slope ~ 20 deg/zoom
      prev = v;
    }
  });
  it('has no kink at the ends (slope near 0)', () => {
    expect(tiltLimit(2.01)).toBeLessThan(0.05);
    expect(ENGINE_MAX_PITCH - tiltLimit(12.49)).toBeLessThan(0.05);
  });
  it('is in the intended range in between', () => {
    expect(tiltLimit(3)).toBeGreaterThan(3);
    expect(tiltLimit(3)).toBeLessThan(10);
    expect(tiltLimit(5)).toBeGreaterThan(18);
    expect(tiltLimit(5)).toBeLessThan(30);
    expect(tiltLimit(8)).toBeGreaterThan(40);
    expect(tiltLimit(8)).toBeLessThan(55);
  });
  it('treats the map as flat below one degree', () => {
    expect(tiltAvailable(2)).toBe(false);
    expect(tiltAvailable(2.2)).toBe(false);
    expect(tiltAvailable(2.5)).toBe(true);
  });
});

describe('clamp logic', () => {
  it('clampPitch cuts to the limit and never goes negative', () => {
    expect(clampPitch(2, 60)).toBe(0);
    expect(clampPitch(3, 70)).toBeCloseTo(tiltLimit(3));
    expect(clampPitch(13, 60)).toBe(60);
    expect(clampPitch(13, -5)).toBe(0);
  });
  it('wrapBearing normalises', () => {
    expect(wrapBearing(190)).toBeCloseTo(-170);
    expect(wrapBearing(-190)).toBeCloseTo(170);
    expect(wrapBearing(360)).toBeCloseTo(0);
    expect(wrapBearing(180)).toBe(180);
  });
  it('needsNorthReset only below zoom 5 and beyond half a degree', () => {
    expect(needsNorthReset(4.9, 90)).toBe(true);
    expect(needsNorthReset(4.9, 0.2)).toBe(false);
    expect(needsNorthReset(4.9, 360)).toBe(false);
    expect(needsNorthReset(5, 90)).toBe(false);
  });
  it('clampCamera clamps pitch and zeroes bearing zoomed out', () => {
    const c = { lng: 10, lat: 50, zoom: 2, bearing: 40, pitch: 60 };
    expect(clampCamera(c)).toEqual({ ...c, pitch: 0, bearing: 0 });
    const d = { ...c, zoom: 9 };
    expect(clampCamera(d)).toEqual({ ...d, pitch: tiltLimit(9) });
    expect(clampCamera({ ...c, zoom: 13 })).toEqual({ ...c, zoom: 13 });
  });
});
