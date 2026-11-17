import { describe, expect, it } from 'vitest';
import type { BuildingSample } from '../../ext/types';
import { parseColour, roofColour, wallColour } from './colours';
import { withoutSplitOutlines } from './outlines';

const sq = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
const b = (id: string, ring: [number, number][], part = false, tags: Record<string, string> = {}): BuildingSample => ({ id, part, rings: [ring], tags });

describe('outlines that are split into parts', () => {
  it('drops the outline that has a part inside, keeps the part and the other buildings', () => {
    const items = [b('w1', sq(0, 0, 10)), b('w2', sq(2, 2, 4), true), b('w3', sq(50, 50, 10))];
    expect(withoutSplitOutlines(items).map((i) => i.id)).toEqual(['w2', 'w3']);
  });

  it('keeps everything when there are no parts', () => {
    const items = [b('w1', sq(0, 0, 10)), b('w3', sq(50, 50, 10))];
    expect(withoutSplitOutlines(items)).toHaveLength(2);
  });

  it('finds a part whose centre lies outside of it (a U shape) by a point just inside', () => {
    const u: [number, number][] = [[2, 2], [8, 2], [8, 8], [6, 8], [6, 4], [4, 4], [4, 8], [2, 8], [2, 2]];
    const items = [b('w1', sq(0, 0, 10)), b('w2', u, true)];
    expect(withoutSplitOutlines(items).map((i) => i.id)).toEqual(['w2']);
  });
});

describe('colours', () => {
  it('reads hex and names, with spaces and underscores', () => {
    expect(parseColour('#cc3300')).toBe(0xcc3300);
    expect(parseColour('#c30')).toBe(0xcc3300);
    expect(parseColour('Light_Grey')).toBe(0xd3d3d3);
    expect(parseColour('hellblau')).toBeUndefined();
  });

  it('takes the explicit colour before the material before the default', () => {
    expect(wallColour({ 'building:colour': '#112233', 'building:material': 'brick' })).toBe(0x112233);
    expect(wallColour({ 'building:material': 'brick' })).toBe(0xb5614a);
    expect(wallColour({})).toBe(0xd8d2c8);
    expect(roofColour({ 'roof:material': 'slate' }, true)).toBe(0x4b5159);
    expect(roofColour({}, true)).not.toBe(roofColour({}, false));
  });
});
