import { describe, expect, it } from 'vitest';
import { distanceToLine, mergeNear, tilesAlong } from './cameras';

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
  it('merges cameras of the same kind a few metres apart', () => {
    const c = (id: string, lng: number, kind: 'fixed' | 'mobile'): import('./cameras').RouteCamera => ({ id, lng, lat: 52.5, kind, title: id });
    const m = mergeNear([c('a', 13.368, 'fixed'), c('b', 13.36802, 'fixed'), c('c', 13.36802, 'mobile'), c('d', 13.37, 'fixed')]);
    expect(m.map((x) => x.id)).toEqual(['a', 'c', 'd']);
  });
});
