import { describe, expect, it } from 'vitest';
import { indoorLevels, indoorOverpassQuery, indoorPlanFromOverpass } from './indoor';

describe('indoor', () => {
  it('builds rooms, walls, stairs and shops from overpass', () => {
    const raw = {
      elements: [
        { type: 'way', id: 1, geometry: [{ lat: 50, lon: 8 }, { lat: 50, lon: 8.001 }, { lat: 50.001, lon: 8.001 }, { lat: 50.001, lon: 8 }, { lat: 50, lon: 8 }], tags: { indoor: 'room', level: '0', name: 'Halle A' } },
        { type: 'way', id: 2, geometry: [{ lat: 50, lon: 8 }, { lat: 50.001, lon: 8 }], tags: { indoor: 'wall', level: '0' } },
        { type: 'node', id: 3, lat: 50.0005, lon: 8.0005, tags: { indoor: 'stairs', level: '0' } },
        { type: 'node', id: 4, lat: 50.0006, lon: 8.0006, tags: { shop: 'books', level: '0', name: 'Buchladen' } },
      ],
    };
    const f = indoorPlanFromOverpass(raw);
    expect(f.some((x) => x.properties.kind === 'room')).toBe(true);
    expect(f.some((x) => x.properties.kind === 'wall')).toBe(true);
    expect(f.some((x) => x.properties.kind === 'stairs')).toBe(true);
    expect(f.some((x) => x.properties.kind === 'shop')).toBe(true);
    expect(indoorLevels(f)).toEqual(['0']);
    expect(indoorOverpassQuery({ west: 8, south: 50, east: 8.001, north: 50.001 })).toContain('indoor');
  });
});