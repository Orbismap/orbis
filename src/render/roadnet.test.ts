import { describe, expect, it } from 'vitest';
import { cutLine, junctionZones, lineLength, smooth, kerbStrips, takeFromStart, type XY } from './roadgeom';
import { buildRoadNet, lerpColour, mergeChains, roadClass, roadSpec } from './roadnet';

const L = (pts: XY[]) => lineLength(pts);

describe('roadgeom', () => {
  it('smooth keeps the ends and rounds corners without leaving the corner box', () => {
    const p: XY[] = [[0, 0], [100, 0], [100, 100]];
    const s = smooth(p);
    expect(s[0]).toEqual([0, 0]);
    expect(s[s.length - 1]).toEqual([100, 100]);
    expect(s.length).toBeGreaterThan(5);
    expect(s.some((q) => q[0] === 100 && q[1] === 0)).toBe(false); // the sharp corner is gone
    expect(L(s)).toBeLessThan(L(p));
  });
  it('cutLine removes zones and drops tiny leftovers', () => {
    const parts = cutLine([[0, 0], [100, 0]], [[40, 60]]);
    expect(parts).toHaveLength(2);
    expect(L(parts[0]!)).toBeCloseTo(40);
    expect(parts[1]![0]![0]).toBeCloseTo(60);
    expect(cutLine([[0, 0], [100, 0]], [[1, 99]])).toHaveLength(0);
    expect(cutLine([[0, 0], [10, 0]], [])).toHaveLength(1);
  });
  it('junctionZones: a crossing cuts both lines, a straight continuation does not', () => {
    const lines = [
      { pts: [[-50, 0], [50, 0]] as XY[], hw: 3, level: 0 },
      { pts: [[0, -50], [0, 50]] as XY[], hw: 3, level: 0 },
    ];
    const z = junctionZones(lines);
    expect(z.get(0)![0]![0]).toBeLessThan(50 - 3);
    expect(z.get(0)![0]![1]).toBeGreaterThan(50 + 3);
    expect(z.get(1)).toBeDefined();
    const cont = junctionZones([{ pts: [[0, 0], [50, 0]] as XY[], hw: 3, level: 0 }, { pts: [[50, 0], [100, 0]] as XY[], hw: 3, level: 0 }]);
    expect(cont.size).toBe(0);
    const bridge = junctionZones([{ pts: [[-50, 0], [50, 0]] as XY[], hw: 3, level: 0 }, { pts: [[0, -50], [0, 50]] as XY[], hw: 3, level: 1 }]);
    expect(bridge.size).toBe(0);
  });
  it('a T junction trims the side road end and the main road', () => {
    const z = junctionZones([
      { pts: [[-50, 0], [50, 0]] as XY[], hw: 4, level: 0 },
      { pts: [[0, 50], [0, 0.5]] as XY[], hw: 3, level: 0 },
    ]);
    expect(z.get(0)).toBeDefined();
    expect(z.get(1)!.some(([a, b]) => a < 49.5 && b > 49.5)).toBe(true);
  });
});

describe('kerbStrips', () => {
  // a straight road along x: neighbours 0..30 and 70..100, the bridge in between
  const q = kerbStrips([[0, 0], [100, 0]], 3.5, 30, 70, 1.5, 0.5, 20);
  const width = (r: XY[]) => Math.max(...r.map((p) => Math.abs(p[1]))) - 3.5;
  const mid = (r: XY[]) => (r[0]![0] + r[2]![0]) / 2;
  it('has the full width along the whole bridge and tapers outside of it', () => {
    for (const { ring, t } of q.filter((x) => mid(x.ring) > 31 && mid(x.ring) < 69)) { expect(width(ring)).toBeCloseTo(1.5, 5); expect(t).toBe(0); }
    const out = q.filter((x) => mid(x.ring) < 29).sort((a, b) => mid(a.ring) - mid(b.ring));
    expect(out[0]!.t).toBeGreaterThan(0.95); // far from the bridge: normal kerb
    expect(width(out[0]!.ring)).toBeLessThan(0.6);
    expect(out[out.length - 1]!.t).toBeLessThan(0.1); // next to the bridge: bridge kerb
  });
  it('never covers the road surface and changes smoothly', () => {
    for (const { ring } of q) for (const p of ring) expect(Math.abs(p[1])).toBeGreaterThanOrEqual(3.5 - 1e-9);
    const ts = q.filter((x) => x.ring[0]![1] > 0 && mid(x.ring) < 30).sort((a, b) => mid(a.ring) - mid(b.ring)).map((x) => x.t);
    for (let i = 1; i < ts.length; i++) expect(Math.abs(ts[i]! - ts[i - 1]!)).toBeLessThan(0.15);
  });
  it('takeFromStart and colour blend', () => {
    expect(takeFromStart([[0, 0], [10, 0], [10, 10]], 15)).toEqual([[0, 0], [10, 0], [10, 5]]);
    expect(lerpColour('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(lerpColour('#364058', '#56627f', 0)).toBe('#364058');
  });
});

describe('roadnet', () => {
  const deg = (m: number) => m / 111320;
  it('classes and widths', () => {
    expect(roadClass({ class: 'minor' })).toBe('minor');
    expect(roadClass({ class: 'motorway', ramp: 1 })).toBe('link');
    expect(roadClass({ class: 'path', subclass: 'footway' })).toBe('foot');
    expect(roadClass({ class: 'path', subclass: 'cycleway' })).toBe('cycle');
    expect(roadClass({ class: 'rail' })).toBeUndefined();
    expect(roadSpec('tertiary', 1).mid).toBe('');
    expect(roadSpec('motorway', 1).mid).toBe('c');
    expect(roadSpec('tertiary', 0).w).toBeGreaterThan(roadSpec('tertiary', 1).w);
  });
  it('builds smoothed roads and cuts centre lines at a crossing; duplicates from tile buffers are dropped', () => {
    const ew = [[13 - deg(100) * 1.5, 52], [13 + deg(100) * 1.5, 52]];
    const ns = [[13, 52 - deg(100)], [13, 52 + deg(100)]];
    const net = buildRoadNet([
      { cls: 'secondary', oneway: 0, level: 0, coords: ew },
      { cls: 'secondary', oneway: 0, level: 0, coords: ew }, // duplicate
      { cls: 'secondary', oneway: 0, level: 0, coords: ns },
    ], 13, 52);
    expect(net.roads.features).toHaveLength(2);
    expect(net.marks.features.length).toBe(4); // two lines, each cut in two
    expect(net.roads.features[0]!.properties).toMatchObject({ cls: 'secondary', mid: 'a' });
  });
  it('keeps levels apart, also stacked ones (layer 1 and 2): a bridge does not cut the road below, a tunnel gets no markings', () => {
    const ew = [[13 - deg(100) * 1.5, 52], [13 + deg(100) * 1.5, 52]];
    const ns = [[13, 52 - deg(100)], [13, 52 + deg(100)]];
    const net = buildRoadNet([
      { cls: 'secondary', oneway: 0, level: 0, coords: ew },
      { cls: 'secondary', oneway: 0, level: 1, coords: ns },
      { cls: 'secondary', oneway: 0, level: -1, coords: [[13.001, 52 - deg(100)], [13.001, 52 + deg(100)]] },
    ], 13, 52);
    expect(net.roads.features.map((f) => f.properties.lv).sort()).toEqual([-1, 0, 1]);
    expect(net.marks.features.map((f) => f.properties.lv).sort()).toEqual([0, 1]); // one uncut line per level, none in the tunnel
  });
  it('joins pieces of a road so a bend between them can be smoothed', () => {
    const mk = (coords: number[][], oneway = 0, cls = 'minor') => ({ r: { cls, oneway, level: 0, coords }, pts: coords as [number, number][], spec: { rank: 3, w: 5, mid: 'd' as const } });
    const merged = mergeChains([mk([[0, 0], [50, 0]]), mk([[50, 0], [50, 50]]), mk([[100, 100], [50, 50]])]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.pts).toEqual([[0, 0], [50, 0], [50, 50], [100, 100]]);
    // different class, a oneway that would have to be turned around, and a place where three roads meet stay apart
    expect(mergeChains([mk([[0, 0], [50, 0]]), mk([[50, 0], [50, 50]], 0, 'service')])).toHaveLength(2);
    expect(mergeChains([mk([[0, 0], [50, 0]], 1), mk([[50, 50], [50, 0]], 1)])).toHaveLength(2);
    expect(mergeChains([mk([[0, 0], [50, 0]]), mk([[50, 0], [50, 50]]), mk([[50, 0], [100, 0]])])).toHaveLength(3);
  });
});
