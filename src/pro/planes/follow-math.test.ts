import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../world3d/frame';
import { frame, H, W } from '../world3d/testcamera';
import { focusCentre, placeAhead, sightToObject, slerp } from './follow-math';

const ZOOM_OF = (zn: number, lat: number) => zn + Math.log2(Math.cos((lat * Math.PI) / 180));

/** How far from the middle of the screen the object is with the map centre for it (CSS px). */
function miss(p: Vec3, zoom: number, t: number, pitch: number, bearing: number) {
  const [lng, lat] = focusCentre(p, bearing, pitch, t);
  const s = frame(ZOOM_OF(zoom, lat), t, lng, lat, pitch, bearing, p[2]).toScreen(p[0], p[1], p[2]);
  expect(s).not.toBeNull();
  return Math.hypot(s![0] - W / 2, s![1] - H / 2);
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
      for (const bearing of [0, 45, 135, -90]) expect(miss([13.4, 52.5, 11000], 5, 1, pitch, bearing)).toBeLessThan(0.01);
    }
  });

  it('on the flat map through the centre elevation', () => {
    expect(miss([13.4, 52.5, 11000], 12, 0, 60, 30)).toBeLessThan(0.01);
  });

  it('nearly during the blend', () => {
    for (const t of [0.25, 0.5, 0.75]) expect(miss([13.4, 52.5, 11000], 11.5, t, 60, 30)).toBeLessThan(1);
  });
});

describe('slerp', () => {
  it('runs along the great circle between two places', () => {
    expect(slerp([0, 0], [90, 0], 0.5)[0]).toBeCloseTo(45);
    expect(slerp([10, 50], [10, 50], 0.3)).toEqual([10, 50]);
  });
});
