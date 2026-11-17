import { describe, expect, it } from 'vitest';
import { buildBuilding, dimensions, parseLength, roofShapeOf, type Pt } from './roofs';

const rect = (w: number, h: number, x0 = 0, y0 = 0): Pt[] => [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
/** Area of the triangles seen from above (m²) */
const projected = (t: number[]) => {
  let s = 0;
  for (let i = 0; i < t.length; i += 9) s += Math.abs((t[i + 3]! - t[i]!) * (t[i + 7]! - t[i + 1]!) - (t[i + 6]! - t[i]!) * (t[i + 4]! - t[i + 1]!)) / 2;
  return s;
};
const zs = (t: number[]) => t.filter((_, i) => i % 3 === 2);
const zMax = (t: number[]) => Math.max(...zs(t));
const zMin = (t: number[]) => Math.min(...zs(t));
/** Normal z component of every triangle: > 0 faces up */
const upward = (t: number[]) => {
  const out: number[] = [];
  for (let i = 0; i < t.length; i += 9) out.push((t[i + 3]! - t[i]!) * (t[i + 7]! - t[i + 1]!) - (t[i + 6]! - t[i]!) * (t[i + 4]! - t[i + 1]!));
  return out;
};

describe('lengths and tags', () => {
  it('reads metres, comma decimals and feet', () => {
    expect(parseLength('12')).toBe(12);
    expect(parseLength('12,5 m')).toBe(12.5);
    expect(parseLength("40'")).toBeCloseTo(12.192, 3);
    expect(parseLength('40\' 6"')).toBeCloseTo(12.3444, 3);
    expect(parseLength('hoch')).toBeUndefined();
    expect(parseLength(undefined)).toBeUndefined();
  });

  it('knows roof shapes and their synonyms, the rest is flat', () => {
    expect(roofShapeOf({ 'roof:shape': 'Pitched' })).toBe('gabled');
    expect(roofShapeOf({ 'roof:shape': 'lean_to' })).toBe('skillion');
    expect(roofShapeOf({ 'roof:shape': 'hipped' })).toBe('hipped');
    expect(roofShapeOf({ 'roof:shape': 'wild' })).toBe('flat');
    expect(roofShapeOf({})).toBe('flat');
  });

  it('puts the roof on top of the walls: height is the highest point', () => {
    expect(dimensions({ height: '12', 'roof:shape': 'gabled', 'roof:height': '4' })).toMatchObject({ eave: 8, rise: 4, top: 12, base: 0 });
    // levels: the roof comes on top of the storeys
    expect(dimensions({ 'building:levels': '4', 'roof:shape': 'hipped' })).toMatchObject({ eave: 12, rise: 3, top: 15 });
    expect(dimensions({ 'building:levels': '4' })).toMatchObject({ eave: 12, rise: 0, top: 12 });
    expect(dimensions({ height: '20', min_height: '8' })).toMatchObject({ base: 8, top: 20 });
    expect(dimensions({ 'building:min_level': '2', 'building:levels': '5' }).base).toBe(6);
    // a roof can not be taller than the building
    expect(dimensions({ height: '4', 'roof:shape': 'gabled', 'roof:height': '9' }).eave).toBeGreaterThanOrEqual(0.5);
    // nothing known: a plain 6 m house
    expect(dimensions({})).toMatchObject({ eave: 6, top: 6 });
  });
});

describe('roofs over a 10 x 6 m rectangle', () => {
  const tags = (shape: string, extra: Record<string, string> = {}) => ({ height: '9', 'roof:height': '3', 'roof:shape': shape, ...extra });

  for (const shape of ['gabled', 'hipped', 'half-hipped', 'skillion', 'gambrel', 'mansard', 'round', 'pyramidal', 'dome', 'onion', 'cone', 'flat']) {
    it(`${shape}: covers the footprint once, stays between eave and top, faces up`, () => {
      const m = buildBuilding([rect(10, 6)], tags(shape))!;
      expect(m).not.toBeNull();
      // the bulb of an onion overhangs: it covers more than the footprint and its underside faces down
      if (shape !== 'onion') {
        expect(projected(m.roof)).toBeCloseTo(60, 3);
        expect(upward(m.roof).every((n) => n > -1e-9)).toBe(true);
      }
      expect(zMin(m.roof)).toBeGreaterThanOrEqual(6 - 1e-6);
      expect(zMax(m.roof)).toBeLessThanOrEqual(9 + 1e-6);
      expect(zMin(m.walls)).toBeCloseTo(0, 6);
      expect(zMax(m.walls)).toBeLessThanOrEqual(9 + 1e-6);
    });
  }

  it('gabled: the ridge reaches the top along the long axis, the long walls end at the eave, the gable ends are pointed', () => {
    const m = buildBuilding([rect(10, 6)], tags('gabled'))!;
    expect(zMax(m.roof)).toBeCloseTo(9, 6);
    // ridge vertices: y = 3 (middle of the 6 m side), at both ends
    const ridge: Pt[] = [];
    for (let i = 0; i < m.roof.length; i += 3) if (Math.abs(m.roof[i + 2]! - 9) < 1e-6) ridge.push([m.roof[i]!, m.roof[i + 1]!]);
    expect(ridge.length).toBeGreaterThan(0);
    expect(ridge.every(([, y]) => Math.abs(y - 3) < 1e-6)).toBe(true);
    // walls reach z = 9 only on the short sides (x = 0 or 10)
    for (let i = 0; i < m.walls.length; i += 3) if (m.walls[i + 2]! > 6 + 1e-6) expect([0, 10]).toContain(Math.round(m.walls[i]! * 1e6) / 1e6);
    expect(zMax(m.walls)).toBeCloseTo(9, 6);
  });

  it('hipped: no gable, every wall ends at the eave', () => {
    const m = buildBuilding([rect(10, 6)], tags('hipped'))!;
    expect(zMax(m.walls)).toBeCloseTo(6, 6);
    expect(zMax(m.roof)).toBeCloseTo(9, 6);
  });

  it('roof:orientation=across turns the ridge by 90°', () => {
    const m = buildBuilding([rect(10, 6)], tags('gabled', { 'roof:orientation': 'across' }))!;
    const ridge: Pt[] = [];
    for (let i = 0; i < m.roof.length; i += 3) if (Math.abs(m.roof[i + 2]! - 9) < 1e-6) ridge.push([m.roof[i]!, m.roof[i + 1]!]);
    expect(ridge.every(([x]) => Math.abs(x - 5) < 1e-6)).toBe(true);
  });

  it('skillion: low side at the eave, high side at the top, slope direction from roof:direction', () => {
    // slope faces east (90°): the east wall is low, the west wall high
    const m = buildBuilding([rect(10, 6)], tags('skillion', { 'roof:direction': '90' }))!;
    const zAt = (x: number) => { const v: number[] = []; for (let i = 0; i < m.roof.length; i += 3) if (Math.abs(m.roof[i]! - x) < 1e-6) v.push(m.roof[i + 2]!); return v; };
    expect(Math.max(...zAt(10))).toBeCloseTo(6, 6);
    expect(Math.min(...zAt(0))).toBeCloseTo(9, 6);
  });

  it('dome: round at the top, the walls stay at the eave', () => {
    const m = buildBuilding([rect(6, 6)], tags('dome'))!;
    expect(zMax(m.roof)).toBeCloseTo(9, 6);
    expect(zMax(m.walls)).toBeCloseTo(6, 6);
  });
});

describe('odd footprints', () => {
  const L: Pt[] = [[0, 0], [12, 0], [12, 4], [4, 4], [4, 10], [0, 10]];
  const tags = { height: '10', 'roof:height': '4', 'roof:shape': 'gabled' };

  it('cuts a gabled roof over an L without gaps or overlaps', () => {
    const m = buildBuilding([L], tags)!;
    expect(projected(m.roof)).toBeCloseTo(12 * 4 + 4 * 6, 3);
    expect(zMax(m.roof)).toBeLessThanOrEqual(10 + 1e-6);
    expect(zMin(m.roof)).toBeGreaterThanOrEqual(6 - 1e-6);
  });

  it('cuts a courtyard out of the roof and puts walls on the inside', () => {
    const m = buildBuilding([rect(20, 20), rect(6, 6, 7, 7)], { height: '12', 'roof:height': '3', 'roof:shape': 'hipped' })!;
    expect(projected(m.roof)).toBeCloseTo(400 - 36, 3);
    const inner = [];
    for (let i = 0; i < m.walls.length; i += 9) if (m.walls[i]! > 6 && m.walls[i]! < 14 && m.walls[i + 1]! > 6 && m.walls[i + 1]! < 14) inner.push(i);
    expect(inner.length).toBeGreaterThan(0);
  });

  it('accepts clockwise rings, closed rings and rings with repeated points', () => {
    const cw = rect(10, 6).reverse();
    const closed = [...rect(10, 6), rect(10, 6)[0]!, rect(10, 6)[0]!];
    expect(projected(buildBuilding([cw], tags)!.roof)).toBeCloseTo(60, 3);
    expect(projected(buildBuilding([closed], tags)!.roof)).toBeCloseTo(60, 3);
  });

  it('refuses outlines that are not a surface', () => {
    expect(buildBuilding([[[0, 0], [1, 1]]], {})).toBeNull();
    expect(buildBuilding([[[0, 0], [0.1, 0], [0.1, 0.1]]], {})).toBeNull();
  });
});

describe('parts', () => {
  it('lifts a floating part off the ground and closes it from below', () => {
    const m = buildBuilding([rect(10, 6)], { height: '20', min_height: '12' })!;
    expect(zMin(m.walls)).toBeCloseTo(12, 6);
    expect(zMax(m.roof)).toBeCloseTo(20, 6);
    // the underside faces down
    expect(upward(m.walls).some((n) => n < 0)).toBe(true);
  });

  it('draws a canopy (building:part=roof) without walls', () => {
    const m = buildBuilding([rect(10, 6)], { 'building:part': 'roof', height: '5', min_height: '4.5' })!;
    expect(m.roof.length).toBeGreaterThan(0);
    // only the underside, no vertical triangles
    for (let i = 0; i < m.walls.length; i += 9) expect(m.walls[i + 2]).toBeCloseTo(4.5, 6);
  });
});
