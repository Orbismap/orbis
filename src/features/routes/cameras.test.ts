import { describe, expect, it } from 'vitest';
import { distanceToLine, tilesAlong } from './cameras';

describe('route cameras', () => {
  it('measures the distance to a line in metres', () => {
    const line: [number, number][] = [[10, 50], [10.1, 50]];
    expect(distanceToLine([10.05, 50.0002], line)).toBeCloseTo(22, 0);
    expect(distanceToLine([9.9, 50], line)).toBeGreaterThan(7000);
  });
  it('lists the tiles a line passes through, also between far apart points', () => {
    const t = tilesAlong([[10, 50], [10.5, 50]], 12);
    expect(t.length).toBeGreaterThanOrEqual(6);
    expect(new Set(t.map((x) => x.join())).size).toBe(t.length);
  });
});
