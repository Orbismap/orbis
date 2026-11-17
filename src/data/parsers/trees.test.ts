import { describe, expect, it } from 'vitest';
import { buildTreeSamples, type RawTree, type TreeView } from './trees';

const view: TreeView = { west: 13, east: 13.01, south: 52, north: 52.01, centreLng: 13.005, centreLat: 52.005 };
const tree = (id: number, lng: number, lat: number, props: Record<string, unknown> = {}): RawTree => ({ lng, lat, props: { id, ...props } });

describe('tree samples', () => {
  it('keeps trees once and reads the tags', () => {
    const t = tree(1, 13.005, 52.005, { height: 12, circumference: 1.4, leaf_type: 'broadleaved', leaf_cycle: 'deciduous' });
    expect(buildTreeSamples([t, t], view)).toEqual([{ id: '1', lng: 13.005, lat: 52.005, heightM: 12, circumferenceM: 1.4, leafType: 'broadleaved', leafCycle: 'deciduous' }]);
  });

  it('ignores nonsense tags', () => {
    const [s] = buildTreeSamples([tree(2, 13.005, 52.005, { height: -3, circumference: 'big', leaf_type: 'palm' })], view);
    expect(s).toMatchObject({ heightM: undefined, circumferenceM: undefined, leafType: undefined });
  });

  it('drops trees far outside the view', () => {
    expect(buildTreeSamples([tree(1, 14, 52.005), tree(2, 13.005, 53), tree(3, 13.005, 52.005)], view).map((s) => s.id)).toEqual(['3']);
  });

  it('puts longitudes into the copy of the world next to the view', () => {
    const v: TreeView = { west: 179.99, east: 180.01, south: 0, north: 0.01, centreLng: 180, centreLat: 0.005 };
    expect(buildTreeSamples([tree(1, -179.999, 0.005)], v)[0]!.lng).toBeCloseTo(180.001, 6);
  });

  it('keeps the trees nearest to the centre above the cap', () => {
    const raw = [tree(1, 13.001, 52.001), tree(2, 13.0049, 52.0049), tree(3, 13.0099, 52.0099)];
    expect(buildTreeSamples(raw, view, 2).map((s) => s.id).sort()).toEqual(['1', '2']);
  });
});
