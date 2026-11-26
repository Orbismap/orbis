import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { metres, pxPerMetre16, roadSignature } from './strassenmarkierungen';

describe('Straßenmarkierungen rebuild', () => {
  const road = (x: number, cls = 'residential') => ({ cls, oneway: 0, level: 0, coords: [[x, 48], [x + 0.001, 48.001]] });
  it('knows the same roads again in any order, and notices a change', () => {
    expect(roadSignature([road(2), road(3)])).toBe(roadSignature([road(3), road(2)]));
    expect(roadSignature([road(2), road(3)])).not.toBe(roadSignature([road(2)]));
    expect(roadSignature([road(2)])).not.toBe(roadSignature([road(2, 'primary')]));
  });
});

describe('Straßenmarkierungen scale', () => {
  it('px per metre at zoom 16 grows with the latitude', () => {
    expect(pxPerMetre16(0)).toBeCloseTo(0.8373, 4);
    expect(pxPerMetre16(60)).toBeCloseTo(1.6746, 3);
  });
  it('metres() doubles per zoom level, with an optional pixel floor', () => {
    const e = metres(6, 1.3) as unknown as [string, unknown, unknown, ...number[]];
    expect(e[4]).toBeCloseTo(7.8);
    expect(e[6]).toBeCloseTo(31.2);
    expect(e[8]).toBeCloseTo(499.2);
    expect((metres(0.2, 1.3, 0.7) as unknown as number[])[4]).toBe(0.7);
  });
  it('produces valid style expressions (constants, data-driven width and offset)', () => {
    const style = {
      version: 8, sources: { s: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
      layers: [
        { id: 'a', type: 'line', source: 's', paint: { 'line-width': metres(6, 1.3), 'line-offset': metres(-3, 1.3), 'line-dasharray': [15, 30] } },
        { id: 'b', type: 'line', source: 's', paint: { 'line-width': metres(['get', 'w'] as never, 1.3), 'line-offset': metres(['get', 'off'] as never, 1.3) } },
      ],
    };
    expect(validateStyleMin(style as never)).toEqual([]);
  });
});
