import { describe, expect, it } from 'vitest';
import { assembleRings, buildingsQuery, overpassBuildings } from './gebaeude';

const g = (...pts: [number, number][]) => pts.map(([lon, lat]) => ({ lon, lat }));

describe('Overpass buildings', () => {
  it('asks for buildings and parts, ways and multipolygons, in the box', () => {
    const q = buildingsQuery(52.5, 13.3, 52.51, 13.31);
    expect(q).toContain('way["building"]');
    expect(q).toContain('way["building:part"]');
    expect(q).toContain('relation["building"]["type"="multipolygon"]');
    expect(q).toContain('(52.5000,13.3000,52.5100,13.3100)');
  });

  it('turns ways into samples and keeps only the tags the model reads', () => {
    const out = overpassBuildings({ elements: [
      { type: 'way', id: 1, tags: { building: 'house', 'roof:shape': 'gabled', 'addr:street': 'X', height: '9' }, geometry: g([0, 0], [1, 0], [1, 1], [0, 0]) },
      { type: 'way', id: 2, tags: { 'building:part': 'yes', 'building:levels': '3' }, geometry: g([0, 0], [1, 0], [1, 1], [0, 0]) },
      { type: 'way', id: 3, tags: { building: 'yes' }, geometry: g([0, 0], [1, 0]) }, // not a ring
    ] });
    expect(out.map((b) => [b.id, b.part])).toEqual([['w1', false], ['w2', true]]);
    expect(out[0]!.tags).toEqual({ building: 'house', 'roof:shape': 'gabled', height: '9' });
  });

  it('joins the member ways of a multipolygon into rings and gives each outer ring its holes', () => {
    const out = overpassBuildings({ elements: [{
      type: 'relation', id: 7, tags: { building: 'yes', type: 'multipolygon', height: '12' },
      members: [
        // the outer ring comes in two pieces, one of them reversed
        { type: 'way', role: 'outer', geometry: g([0, 0], [10, 0], [10, 10]) },
        { type: 'way', role: 'outer', geometry: g([0, 0], [0, 10], [10, 10]) },
        { type: 'way', role: 'inner', geometry: g([4, 4], [6, 4], [6, 6], [4, 4]) },
        { type: 'way', role: 'inner', geometry: g([40, 40], [41, 40], [41, 41], [40, 40]) }, // belongs to no outer ring
      ],
    }] });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('r7');
    expect(out[0]!.rings).toHaveLength(2);
    expect(out[0]!.rings[0]).toHaveLength(5);
  });

  it('numbers the buildings of a multipolygon with several outer rings', () => {
    const out = overpassBuildings({ elements: [{
      type: 'relation', id: 9, tags: { 'building:part': 'yes' },
      members: [
        { type: 'way', role: 'outer', geometry: g([0, 0], [1, 0], [1, 1], [0, 0]) },
        { type: 'way', role: 'outer', geometry: g([5, 5], [6, 5], [6, 6], [5, 5]) },
      ],
    }] });
    expect(out.map((b) => b.id)).toEqual(['r9.1', 'r9.2']);
    expect(out.every((b) => b.part)).toBe(true);
  });

  it('drops what does not close', () => {
    expect(assembleRings([[[0, 0], [1, 0], [1, 1]]])).toEqual([]);
  });
});
