import { describe, expect, it } from 'vitest';
import { coveredIds, roofSamples } from './roofs-tiles';

const square = (x: number, y: number, s = 0.0001): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
const multi = (rings: [number, number][][][]) => ({ type: 'MultiPolygon', coordinates: rings });

describe('roofSamples', () => {
  it('turns a roof feature into a sample with its tags', () => {
    const [s] = roofSamples([{ geometry: multi([[square(8, 50)]]), properties: { building: 'house', 'roof:shape': 'gabled', 'roof:height': '3' } }]);
    expect(s?.part).toBe(false);
    expect(s?.rings).toHaveLength(1);
    expect(s?.tags).toEqual({ building: 'house', 'roof:shape': 'gabled', 'roof:height': '3' });
  });

  it('marks a building:part without building as a part, and keeps holes', () => {
    const hole = square(8.00002, 50.00002, 0.00002);
    const [s] = roofSamples([{ geometry: multi([[square(8, 50), hole]]), properties: { 'building:part': 'yes', 'roof:shape': 'dome' } }]);
    expect(s?.part).toBe(true);
    expect(s?.rings).toHaveLength(2);
  });

  it('counts a building that two tiles return once', () => {
    const f = { geometry: multi([[square(8, 50)]]), properties: { building: 'yes', 'roof:shape': 'hipped' } };
    expect(roofSamples([f, { ...f }])).toHaveLength(1);
  });

  it('splits a multipolygon into one sample per outer ring and drops rings that are too short', () => {
    const f = { geometry: multi([[square(8, 50)], [square(8.01, 50)], [[[8.02, 50], [8.03, 50], [8.02, 50]]]]), properties: { building: 'yes', 'roof:shape': 'flat' } };
    expect(roofSamples([f])).toHaveLength(2);
  });

  it('ignores non-string properties, empty ones and features without a polygon', () => {
    const out = roofSamples([
      { geometry: { type: 'Point', coordinates: [8, 50] }, properties: { building: 'yes' } },
      { geometry: null },
      { geometry: multi([[square(8, 50)]]), properties: { building: 'yes', 'roof:levels': 2, 'roof:shape': '' } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.tags).toEqual({ building: 'yes' });
  });

  it('stops at the cap', () => {
    const fs = Array.from({ length: 10 }, (_, i) => ({ geometry: multi([[square(8 + i * 0.01, 50)]]), properties: { building: 'yes', 'roof:shape': 'flat' } }));
    expect(roofSamples(fs, 4)).toHaveLength(4);
  });
});

describe('coveredIds', () => {
  const sq = (x: number, y: number, s = 0.0001): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
  const roof = (ring: [number, number][], holes: [number, number][][] = []) => ({ id: 'r', part: false, rings: [ring, ...holes], tags: {} });

  it('covers the flat building of the same shape and leaves the others', () => {
    expect(coveredIds([{ id: 1, ring: sq(8, 50) }, { id: 2, ring: sq(8.01, 50) }], [roof(sq(8, 50))])).toEqual([1]);
  });

  it('covers a flat building inside the roof outline, but not one in a courtyard hole', () => {
    const r = roof(sq(8, 50, 0.001), [sq(8.0004, 50.0004, 0.0002)]);
    expect(coveredIds([{ id: 1, ring: sq(8.0001, 50.0001, 0.00005) }, { id: 2, ring: sq(8.00045, 50.00045, 0.00005) }], [r])).toEqual([1]);
  });

  it('covers a larger flat outline that contains a roof part', () => {
    expect(coveredIds([{ id: 7, ring: sq(8, 50, 0.001) }], [roof(sq(8.0004, 50.0004, 0.0001))])).toEqual([7]);
  });

  it('ignores degenerate rings and no roofs', () => {
    expect(coveredIds([{ id: 1, ring: [[8, 50], [8, 50], [8, 50]] }], [roof(sq(8, 50))])).toEqual([]);
    expect(coveredIds([{ id: 1, ring: sq(8, 50) }], [])).toEqual([]);
  });
});
