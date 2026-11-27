import { describe, expect, it } from 'vitest';
import { blend, cameraFromAngles, directionName, dot, fromNorth, headingOf, isPoor, type Vec } from './attitude';

const close = (a: Vec, b: Vec) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));

describe('camera', () => {
  it('looks down when the device lies flat, its top to the north', () => {
    const c = cameraFromAngles(0, 0, 0);
    close(c.forward, [0, 0, -1]);
    close(c.up, [0, 1, 0]);
    close(c.right, [1, 0, 0]);
  });

  it('looks ahead when held upright; alpha counts anticlockwise', () => {
    close(cameraFromAngles(0, 90, 0).forward, [0, 1, 0]);
    close(cameraFromAngles(0, 90, 0).up, [0, 0, 1]);
    close(cameraFromAngles(90, 90, 0).forward, [-1, 0, 0]);
  });

  it('keeps the horizon level on a screen turned sideways', () => {
    // on its side, the top to the left, looking north
    const c = cameraFromAngles(90, 0, -90, 90);
    close(c.forward, [0, 1, 0]);
    close(c.up, [0, 0, 1]);
    close(c.right, [1, 0, 0]);
  });

  it('names the same heading flat, tilted and upright', () => {
    for (const beta of [0, 30, 60, 90, 110]) expect(headingOf(cameraFromAngles(270, beta, 0))).toBeCloseTo(90, 6);
  });

  it('stays a square frame while smoothing', () => {
    const c = blend(cameraFromAngles(0, 90, 0), cameraFromAngles(60, 70, 10), 0.3);
    expect(Math.hypot(...c.forward)).toBeCloseTo(1, 9);
    expect(Math.hypot(...c.up)).toBeCloseTo(1, 9);
    expect(dot(c.up, c.forward)).toBeCloseTo(0, 9);
    expect(dot(c.right, c.forward)).toBeCloseTo(0, 9);
    expect(headingOf(c)).toBeGreaterThan(330);
  });
});

describe('north', () => {
  it('takes an absolute alpha as it is and ignores a relative one', () => {
    expect(fromNorth({ absolute: true, alpha: 90 }, null)).toEqual({ alpha: 90, offset: null });
    expect(fromNorth({ absolute: false, alpha: 90 }, null)).toBeNull();
    expect(fromNorth({ absolute: true, alpha: null }, null)).toBeNull();
  });

  it('turns the alpha of iOS by the compass heading', () => {
    const north = fromNorth({ alpha: 10, beta: 20, webkitCompassHeading: 90 }, null)!;
    expect((north.alpha + 360) % 360).toBeCloseTo(270, 6);
  });

  it('does not keep a north found while the device is held up', () => {
    const up = fromNorth({ alpha: 10, beta: 100, webkitCompassHeading: 270 }, null)!;
    expect(up.offset).toBeNull();
    // the first level reading then counts at once, not bit by bit
    expect(fromNorth({ alpha: 10, beta: 20, webkitCompassHeading: 90 }, up.offset)!.offset).toBe(260);
  });

  it('keeps the offset while the device is held up', () => {
    // the compass of an upright iPhone may flip by half a turn
    const up = fromNorth({ alpha: 10, beta: 90, webkitCompassHeading: 270 }, 260)!;
    expect(up).toEqual({ alpha: 270, offset: 260 });
    expect(fromNorth({ alpha: 10, beta: 20, webkitCompassHeading: 80 }, 260)!.offset).toBeCloseTo(262, 6);
  });
});

describe('what the compass says', () => {
  it('names directions, also of unwrapped angles', () => {
    expect([0, 44, 100, 350, -90, 765].map(directionName)).toEqual(['Norden', 'Nordosten', 'Osten', 'Norden', 'Westen', 'Nordosten']);
  });
  it('is poor when it cannot tell or may be far off', () => {
    expect([null, 10, 40, -1].map(isPoor)).toEqual([false, false, true, true]);
  });
});
