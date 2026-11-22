import { describe, expect, it } from 'vitest';
import { coveredIds, flatSamples, paintSamples, roofSamples } from './roofs-tiles';

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
  const roof = (ring: [number, number][], tags: Record<string, string> = {}) => ({ id: 'r', part: false, rings: [ring], tags });

  it('covers the flat building of the same shape and leaves the others', () => {
    expect(coveredIds([{ id: 1, ring: sq(8, 50) }, { id: 2, ring: sq(8.01, 50) }], [roof(sq(8, 50))])).toEqual([1]);
  });

  it('covers a flat outline that is a little different from the roof outline', () => {
    expect(coveredIds([{ id: 1, ring: sq(8.000002, 50.000002, 0.000098) }], [roof(sq(8, 50))])).toEqual([1]);
  });

  it('does not cover a building that only lies inside the roof outline (a tower shaft in the footprint of its base)', () => {
    expect(coveredIds([{ id: 1, ring: sq(8.0004, 50.0004, 0.0001) }], [roof(sq(8, 50, 0.001))])).toEqual([]);
  });

  it('does not cover a larger outline that contains a small roof part', () => {
    expect(coveredIds([{ id: 7, ring: sq(8, 50, 0.001) }], [roof(sq(8.0004, 50.0004, 0.0001))])).toEqual([]);
  });

  it('does not cover a part that starts at another height', () => {
    expect(coveredIds([{ id: 1, ring: sq(8, 50), base: 0 }], [roof(sq(8, 50), { min_height: '30' })])).toEqual([]);
    expect(coveredIds([{ id: 1, ring: sq(8, 50), base: 29 }], [roof(sq(8, 50), { min_height: '30' })])).toEqual([1]);
  });

  it('does not cover a part that starts above the ground when the roof says nothing about its height (a tower on its base)', () => {
    expect(coveredIds([{ id: 1, ring: sq(8, 50), base: 20 }], [roof(sq(8, 50))])).toEqual([]);
    expect(coveredIds([{ id: 1, ring: sq(8, 50), base: 0 }], [roof(sq(8, 50))])).toEqual([1]);
  });

  it('finds the roof among many (grid lookup)', () => {
    const roofs = Array.from({ length: 50 }, (_, i) => roof(sq(8 + i * 0.01, 50)));
    expect(coveredIds([{ id: 9, ring: sq(8.25, 50) }], roofs)).toEqual([9]);
  });

  it('ignores degenerate rings and no roofs', () => {
    expect(coveredIds([{ id: 1, ring: [[8, 50], [8, 50], [8, 50]] }], [roof(sq(8, 50))])).toEqual([]);
    expect(coveredIds([{ id: 1, ring: sq(8, 50) }], [])).toEqual([]);
  });
});

describe('flatSamples', () => {
  const sq = (x: number, y: number, s = 0.0001): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
  const poly = (x: number, y: number) => ({ type: 'Polygon', coordinates: [sq(x, y)] });

  it('turns an OpenFreeMap building into a sample with its height and colour', () => {
    const [s] = flatSamples([{ id: 5, geometry: poly(8, 50), properties: { render_height: 12, render_min_height: 3, colour: '#b7b1a6' } }], new Set());
    expect(s?.tags).toEqual({ building: 'yes', height: '12', min_height: '3', 'building:colour': '#b7b1a6' });
    expect(s?.part).toBe(false);
  });

  it('leaves out covered buildings and outlines that have parts (hide_3d)', () => {
    const out = flatSamples([
      { id: 1, geometry: poly(8, 50), properties: { render_height: 5 } },
      { id: 2, geometry: poly(8.01, 50), properties: { render_height: 5 } },
      { id: 3, geometry: poly(8.02, 50), properties: { render_height: 0, hide_3d: true } },
    ], new Set([1]));
    expect(out).toHaveLength(1);
    expect(out[0]?.id.startsWith('o2@')).toBe(true);
  });

  it('keeps the pieces of a building that the tile edge cuts, but not the same piece twice', () => {
    const f = (x: number) => ({ id: 9, geometry: poly(x, 50), properties: { render_height: 6 } });
    expect(flatSamples([f(8), f(8.0001), f(8)], new Set())).toHaveLength(2);
  });

  it('marks a building inside a hidden outline as a part (the shaft of a tower inside its outline), so that Pro keeps it next to other parts', () => {
    const outline = { id: 1, geometry: { type: 'Polygon', coordinates: [sq(8, 50, 0.001)] }, properties: { hide_3d: true, render_height: 0 } };
    const shaft = { id: 2, geometry: poly(8.0004, 50.0004), properties: { render_height: 200 } };
    const other = { id: 3, geometry: poly(8.01, 50), properties: { render_height: 10 } };
    const out = flatSamples([outline, shaft, other], new Set());
    expect(out.map((s) => s.part)).toEqual([true, false]);
  });

  it('stops at the cap', () => {
    const fs = Array.from({ length: 6 }, (_, i) => ({ id: i, geometry: poly(8 + i * 0.01, 50), properties: { render_height: 4 } }));
    expect(flatSamples(fs, new Set(), 3)).toHaveLength(3);
  });
});

describe('paintSamples', () => {
  const b = (tags: Record<string, string>) => ({ id: 'x', part: false, rings: [[[8, 50], [8.1, 50], [8.1, 50.1], [8, 50]] as [number, number][]], tags });

  it('keeps the colours and materials OSM knows, buildings without one get the plain colour', () => {
    const out = paintSamples([b({ building: 'yes', 'building:colour': 'red' }), b({ building: 'yes', 'building:material': 'brick' }), b({ building: 'yes' })], '#d6dae3');
    expect(out[0]?.tags['building:colour']).toBe('red');
    expect(out[1]?.tags['building:colour']).toBeUndefined();
    expect(out[2]?.tags['building:colour']).toBe('#d6dae3');
  });

  it('does not change the input', () => {
    const input = b({ building: 'yes' });
    paintSamples([input], '#fff000');
    expect(input.tags).toEqual({ building: 'yes' });
  });
});
