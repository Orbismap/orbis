import { describe, expect, it } from 'vitest';
import { inQuad, inTriangle, segmentDistance, type Point } from './hit';

describe('segmentDistance', () => {
  it('measures to the nearest point of the segment', () => {
    expect(segmentDistance(5, 3, [0, 0], [10, 0])).toBeCloseTo(3);
    expect(segmentDistance(-4, 3, [0, 0], [10, 0])).toBeCloseTo(5);
    expect(segmentDistance(13, 4, [0, 0], [10, 0])).toBeCloseTo(5);
  });
  it('handles a segment that is a point', () => {
    expect(segmentDistance(3, 4, [0, 0], [0, 0])).toBeCloseTo(5);
  });
});

describe('inTriangle / inQuad', () => {
  it('hits inside, either winding, and misses outside', () => {
    expect(inTriangle(2, 2, [0, 0], [10, 0], [0, 10])).toBe(true);
    expect(inTriangle(2, 2, [0, 0], [0, 10], [10, 0])).toBe(true);
    expect(inTriangle(8, 8, [0, 0], [10, 0], [0, 10])).toBe(false);
  });
  it('covers both halves of a quad', () => {
    const [a, b, c, d]: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(inQuad(8, 2, a!, b!, c!, d!)).toBe(true);
    expect(inQuad(2, 8, a!, b!, c!, d!)).toBe(true);
    expect(inQuad(12, 5, a!, b!, c!, d!)).toBe(false);
  });
});
