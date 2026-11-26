import { describe, expect, it } from 'vitest';
import { guide, isThere, pickTarget, progress, unwrap } from './guide';
import type { Place } from './kinds';

const place = (key: string, lng: number, lat: number): Place => ({ key, lng, lat, title: key, detail: '' });
// at 50° north: 0.001° of latitude ≈ 111 m, of longitude ≈ 71 m
const AT: [number, number] = [8, 50];

describe('target', () => {
  const near = place('near', 8, 50.001), nearer = place('nearer', 8, 50.0009), far = place('far', 8, 50.01);

  it('is the nearest place', () => {
    expect(pickTarget([far, near], AT, null)?.key).toBe('near');
    expect(pickTarget([], AT, near)).toBeNull();
  });

  it('stays while another is only a little nearer', () => {
    expect(pickTarget([near, nearer], AT, near)?.key).toBe('near');
    expect(pickTarget([far, nearer], AT, far)?.key).toBe('nearer');
  });
});

describe('route', () => {
  // 111 m north, then east
  const line: [number, number][] = [[8, 50], [8, 50.001], [8.002, 50.001]];

  it('finds the position on the line and the point ahead', () => {
    const p = progress(line, [8.0001, 50.0005]);
    expect(p.off).toBeCloseTo(7, 0);
    expect(p.segment).toBe(0);
    expect(p.aim[1]).toBeCloseTo(50.000725, 5);
    expect(p.remaining).toBeCloseTo(56 + 143, -1);
  });

  it('points along the route, not straight at the place', () => {
    const g = guide([8, 50.0002], [8.002, 50.001], line);
    expect(g.bearing).toBeCloseTo(0, 0);
    expect(g.distance).toBeCloseTo(89 + 143, -1);
    expect(g.ahead.at(-1)).toEqual([8.002, 50.001]);
  });

  it('points straight at the place close to it, without a route and far off the route', () => {
    expect(guide([8.0018, 50.0009], [8.002, 50.001], line).distance).toBeLessThan(35);
    expect(guide(AT, [8.002, 50], null)).toMatchObject({ ahead: [] });
    expect(guide(AT, [8.002, 50], null).bearing).toBeCloseTo(90, 0);
    expect(guide([8.01, 49.99], [8.002, 50.001], line).ahead).toEqual([]);
  });
});

describe('arrow', () => {
  it('turns the short way', () => {
    expect(unwrap(350, 10)).toBe(370);
    expect(unwrap(10, 350)).toBe(-10);
    expect(unwrap(725, 0)).toBe(720);
    expect(unwrap(-170, 170)).toBe(-190);
  });

  it('arrives closer with a good position than with a poor one', () => {
    expect(isThere(12, 4)).toBe(true);
    expect(isThere(18, 4)).toBe(false);
    expect(isThere(18, 20)).toBe(true);
    expect(isThere(30, 100)).toBe(false);
  });
});
