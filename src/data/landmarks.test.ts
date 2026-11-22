import { describe, expect, it } from 'vitest';
import { maskedFilter } from '../map/landmark-mask';
import { replacedByLandmark } from '../features/buildings3d/roofs-source';
import { inBoxes, maskOf, ofmId, parseLandmarks, tileOf, tilesInView } from './landmarks';

const ESB = {
  id: 'empire-state-building',
  name: 'Empire State Building',
  anchor: [-73.9859714, 40.7485288],
  minZoom: 13,
  height: 443.2,
  osm: { type: 'way', id: 34633854 },
  additionalOsm: [{ type: 'way', id: 137425125 }, { type: 'relation', id: 77 }],
  bounds: [-73.9873532, 40.7474819, -73.9845896, 40.7495757],
  lods: { low: { url: '/models/esb/abc/low.glb' } },
  placement: { bearing: 29, scale: 1 },
  artisticLicense: 'CC0-1.0',
};

describe('landmarks dataset', () => {
  it('turns a tile into samples with absolute model URLs', () => {
    const [l] = parseLandmarks({ assets: [ESB] }, 'https://example.org');
    expect(l).toMatchObject({ id: 'empire-state-building', lng: -73.9859714, lat: 40.7485288, bearing: 29, scale: 1, minZoom: 13, elevationM: 0, url: 'https://example.org/models/esb/abc/low.glb' });
    expect(l!.osmIds).toEqual([346338542, 1374251252, 773]);
  });
  it('drops entries without a model or anchor, and models under another licence', () => {
    expect(parseLandmarks({ assets: [{ ...ESB, lods: {} }, { ...ESB, anchor: undefined }, { ...ESB, artisticLicense: 'CC-BY-4.0' }] })).toEqual([]);
    expect(parseLandmarks(null)).toEqual([]);
  });
  it('maps OSM elements to OpenFreeMap feature ids', () => {
    expect(ofmId({ type: 'way', id: 5 })).toBe(52);
    expect(ofmId({ type: 'relation', id: 5 })).toBe(53);
    expect(ofmId({ type: 'node', id: 5 })).toBeUndefined();
  });
  it('finds the occupied index tiles of a view, nearest first', () => {
    const [x, y] = tileOf(-73.9859714, 40.7485288);
    expect(x).toBe(1206);
    expect(y).toBe(1539);
    const cat = { template: '', occupied: new Set([`${x}/${y}`, `${x + 1}/${y}`, '1/1']) };
    expect(tilesInView(cat, -74.0, 40.70, -73.9, 40.80)).toEqual([`${x}/${y}`, `${x + 1}/${y}`]);
    expect(tilesInView(cat, 10, 10, 11, 11)).toEqual([]);
  });
});

describe('the model has priority over the OSM building', () => {
  const items = parseLandmarks({ assets: [ESB] });
  const mask = maskOf(items);
  it('hides the 2.5D buildings by feature id and keeps the filter the style had', () => {
    expect(maskedFilter(undefined, new Set())).toBeUndefined();
    const f = maskedFilter(['!', ['to-boolean', ['get', 'hide_3d']]], mask.ids) as unknown[];
    expect(f[0]).toBe('all');
    expect(JSON.stringify(f)).toContain('346338542');
    expect(JSON.stringify(maskedFilter(undefined, mask.ids))).toContain('"in"');
  });
  it('leaves the detailed buildings out by id and by position', () => {
    const ring = (lng: number, lat: number): [number, number][][] => [[[lng, lat], [lng + 1e-4, lat], [lng + 1e-4, lat + 1e-4], [lng, lat]]];
    expect(replacedByLandmark({ id: 'o346338542@-73.9,40.7', rings: ring(-73.9, 40.7) }, mask)).toBe(true);
    expect(replacedByLandmark({ id: 't-73.985000,40.748000', rings: ring(-73.985, 40.748) }, mask)).toBe(true);
    expect(replacedByLandmark({ id: 't-73.900000,40.700000', rings: ring(-73.9, 40.7) }, mask)).toBe(false);
    expect(replacedByLandmark({ id: 't-73.985000,40.748000', rings: ring(-73.985, 40.748) }, maskOf([]))).toBe(false);
    expect(inBoxes(-73.985, 40.748, mask.boxes)).toBe(true);
  });
});
