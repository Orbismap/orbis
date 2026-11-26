import { describe, expect, it } from 'vitest';
import { claimsGesture, keyboardInset, snapIndex } from './sheet-physics';

describe('claimsGesture', () => {
  it('raises the sheet on an upward swipe below the top detent, even at the top of the content', () => {
    expect(claimsGesture('half', 0, -4, true)).toBe(true);
    expect(claimsGesture('half', 1, -4, false)).toBe(true);
  });

  it('scrolls the content of the fully open sheet', () => {
    expect(claimsGesture('full', 0, -4, true)).toBe(false);
    expect(claimsGesture('full', 0, 4, false)).toBe(false);
  });

  it('lowers the sheet when the content is pulled down from its top', () => {
    expect(claimsGesture('full', 0, 4, true)).toBe(true);
    expect(claimsGesture('half', 0, 4, true)).toBe(true);
    expect(claimsGesture('half', 0, 4, false)).toBe(false);
  });

  it('leaves sideways movements and the lowered sheet alone', () => {
    expect(claimsGesture('half', 6, -3, true)).toBe(false);
    expect(claimsGesture('peek', 0, -9, true)).toBe(false);
  });
});

describe('keyboardInset', () => {
  it('is the height the keyboard covers', () => {
    expect(keyboardInset(800, { height: 460, offsetTop: 0, scale: 1 })).toBe(340);
    expect(keyboardInset(800, { height: 460, offsetTop: 100, scale: 1 })).toBe(240);
  });

  it('ignores browser bars and pinch zoom', () => {
    expect(keyboardInset(800, { height: 750, offsetTop: 0, scale: 1 })).toBe(0);
    expect(keyboardInset(800, { height: 400, offsetTop: 0, scale: 2 })).toBe(0);
  });
});

describe('snapIndex', () => {
  const points = [100, 400, 700];
  it('takes the nearest detent and moves on with a flick', () => {
    expect(snapIndex(points, 430, 0, 1)).toBe(1);
    expect(snapIndex(points, 420, 1200, 1)).toBe(2);
    expect(snapIndex(points, 380, -1200, 1)).toBe(0);
  });
});
