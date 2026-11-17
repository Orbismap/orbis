import { describe, expect, it } from 'vitest';
import { ROW_SPACING_M, alongLine, buildTreeSamples, hedgeSpacing, type RawTree, type RawTreeLine, type TreeView } from './trees';

const view: TreeView = { west: 13, east: 13.01, south: 52, north: 52.01, centreLng: 13.005, centreLat: 52.005 };
const tree = (id: number, lng: number, lat: number, props: Record<string, unknown> = {}): RawTree => ({ lng, lat, props: { id, ...props } });

describe('tree samples', () => {
  it('keeps trees once and reads the tags', () => {
    const t = tree(1, 13.005, 52.005, { height: 12, circumference: 1.4, leaf_type: 'broadleaved', leaf_cycle: 'deciduous' });
    expect(buildTreeSamples([t, t], [], view)).toEqual([{ id: '13.005000,52.005000', lng: 13.005, lat: 52.005, heightM: 12, circumferenceM: 1.4, leafType: 'broadleaved', leafCycle: 'deciduous' }]);
  });

  it('reads the genus from the genus tag or the first word of the species', () => {
    const genus = (props: Record<string, unknown>) => buildTreeSamples([tree(1, 13.005, 52.005, props)], [], view)[0]!.genus;
    expect(genus({ genus: 'Quercus' })).toBe('quercus');
    expect(genus({ species: 'Betula pendula' })).toBe('betula');
    expect(genus({ genus: ' ', species: "Tilia 'Greenspire'" })).toBe('tilia');
    expect(genus({})).toBeUndefined();
  });

  it('ignores nonsense tags', () => {
    const [s] = buildTreeSamples([tree(2, 13.005, 52.005, { height: -3, circumference: 'big', leaf_type: 'palm' })], [], view);
    expect(s).toMatchObject({ heightM: undefined, circumferenceM: undefined, leafType: undefined });
  });

  it('drops trees far outside the view', () => {
    expect(buildTreeSamples([tree(1, 14, 52.005), tree(2, 13.005, 53), tree(3, 13.005, 52.005)], [], view).map((s) => s.id)).toEqual(['13.005000,52.005000']);
  });

  it('puts longitudes into the copy of the world next to the view', () => {
    const v: TreeView = { west: 179.99, east: 180.01, south: 0, north: 0.01, centreLng: 180, centreLat: 0.005 };
    expect(buildTreeSamples([tree(1, -179.999, 0.005)], [], v)[0]!.lng).toBeCloseTo(180.001, 6);
  });

  it('keeps the trees nearest to the centre above the cap', () => {
    const raw = [tree(1, 13.001, 52.001), tree(2, 13.0049, 52.0049), tree(3, 13.0099, 52.0099)];
    expect(buildTreeSamples(raw, [], view, 2).map((s) => s.lng).sort()).toEqual([13.001, 13.0049]);
  });

  it('has no OSM id: trees are told apart by their position', () => {
    const [a, b] = buildTreeSamples([tree(5, 13.001, 52.001), tree(6, 13.002, 52.002)], [], view);
    expect(a!.id).toBe('13.001000,52.001000');
    expect(b!.id).not.toBe(a!.id);
  });

  describe('lines', () => {
    // 0.001° of latitude is 111 m
    const line = (props: Record<string, unknown>, ...coords: [number, number][]): RawTreeLine => ({ coords, props });

    it('puts points every few metres along a line, starting at its first point', () => {
      const pts = alongLine([[13, 52], [13, 52.001]], 10);
      expect(pts.length).toBe(12); // 111 m: 0, 10, … 110
      expect(pts[0]).toEqual([13, 52]);
      expect(pts[1]![1]).toBeCloseTo(52 + 10 / 111_320, 6);
    });

    it('keeps the distance across bends and gives a point to a very short line', () => {
      expect(alongLine([[13, 52], [13, 52.0005], [13, 52.001]], 10).length).toBe(12);
      expect(alongLine([[13, 52], [13, 52]], 10)).toEqual([[13, 52]]);
    });

    it('plants a tree every ROW_SPACING_M along a tree row', () => {
      const samples = buildTreeSamples([], [line({ kind: 'row', species: 'Tilia cordata', height: 14 }, [13.005, 52.004], [13.005, 52.005])], view);
      expect(samples.length).toBe(Math.floor(111.3 / ROW_SPACING_M) + 1);
      expect(samples.every((s) => s.genus === 'tilia' && s.heightM === 14 && !s.hedge)).toBe(true);
    });

    it('turns a hedge into bushes close together, spaced by its height', () => {
      const run = (height?: number) => buildTreeSamples([], [line({ kind: 'hedge', ...(height ? { height } : {}) }, [13.005, 52.004], [13.005, 52.005])], view);
      expect(run().every((s) => s.hedge && s.heightM === 1.6)).toBe(true);
      expect(run(40)[0]!.heightM).toBe(6);
      expect(run(3).length).toBeLessThan(run(1).length);
      expect(run(1).length).toBeCloseTo(111.3 / hedgeSpacing(1), -1);
    });

    it('drops points of a line outside the view and keeps one point only once', () => {
      const l = line({ kind: 'row' }, [13.005, 52.004], [13.005, 52.005]);
      expect(buildTreeSamples([], [l, l], view).length).toBe(buildTreeSamples([], [l], view).length);
      expect(buildTreeSamples([], [line({ kind: 'row' }, [14, 52], [14, 52.001])], view)).toEqual([]);
    });
  });
});
