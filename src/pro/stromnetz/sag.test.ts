import { describe, expect, it } from 'vitest';
import { sagM, spanSegments, wireAltM } from './sag';

describe('wire sag', () => {
  it('is a parabola: ends fixed, deepest in the middle', () => {
    expect(wireAltM(27, 27, 4, 0)).toBe(27);
    expect(wireAltM(27, 27, 4, 1)).toBe(27);
    expect(wireAltM(27, 27, 4, 0.5)).toBeCloseTo(23, 9);
    expect(wireAltM(27, 27, 4, 0.5)).toBeLessThan(wireAltM(27, 27, 4, 0.25));
  });

  it('follows ends of different height', () => {
    expect(wireAltM(30, 20, 0, 0.5)).toBeCloseTo(25, 9);
    expect(wireAltM(30, 20, 2, 0)).toBe(30);
    expect(wireAltM(30, 20, 2, 1)).toBe(20);
  });

  it('grows with the square of the span, is tighter at high voltage and capped', () => {
    expect(sagM(400, 380, 99)).toBeCloseTo(160000 / (8 * 2300), 6);
    expect(sagM(200, 380, 99)).toBeCloseTo(sagM(400, 380, 99) / 4, 6);
    expect(sagM(300, 20, 99)).toBeGreaterThan(sagM(300, 380, 99));
    expect(sagM(10_000, 20, 3.5)).toBe(3.5);
    expect(sagM(0, 20, 3.5)).toBe(0);
  });

  it('subdivides long spans more, within bounds', () => {
    expect(spanSegments(5)).toBe(4);
    expect(spanSegments(100)).toBe(5);
    expect(spanSegments(1000)).toBe(16);
  });
});
