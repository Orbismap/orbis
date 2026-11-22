import { describe, expect, it } from 'vitest';
import { VectorTile } from '@mapbox/vector-tile';
import { GeoJSONWrapper, fromVectorTileJs, type Feature } from '@maplibre/vt-pbf';
import { PbfReader } from 'pbf';
import { replaceBuildingTile, tilePoint } from '../map/landmark-geometry';
import { replacedByLandmark } from '../features/buildings3d/roofs-source';
import { inBoxes, inFootprint, maskOf, ofmId, parseLandmarks, tileOf, tilesInView } from './landmarks';

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
    expect(l).toMatchObject({ id: 'empire-state-building', lng: -73.9859714, lat: 40.7485288, minZoom: 13, elevationM: 0, url: 'https://example.org/models/esb/abc/low.glb' });
    expect(l!.osmIds).toEqual([346338542, 1374251252, 773]);
  });
  it('drops entries without a model or anchor, and models under another licence', () => {
    expect(parseLandmarks({ assets: [{ ...ESB, lods: {} }, { ...ESB, anchor: undefined }, { ...ESB, artisticLicense: 'CC-BY-4.0' }] })).toEqual([]);
    expect(parseLandmarks(null)).toEqual([]);
  });
  it('maps OSM elements to OpenFreeMap feature ids', () => {
    expect(ofmId({ type: 'way', id: 5 })).toBe(52);
    expect(ofmId({ type: 'relation', id: 5 })).toBe(53);
    expect(ofmId({ type: 'node', id: 5 })).toBe(51);
    expect(ofmId({ type: 'bus', id: 5 })).toBeUndefined();
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

/** A tile of z14 with the given squares (tile pixels, extent 4096) as buildings. */
function tileWith(squares: { id: number; x: number; y: number; size: number }[]): Uint8Array {
  const features = squares.map((q) => ({ id: q.id, type: 3, tags: { render_height: 20 }, geometry: [[[q.x, q.y], [q.x + q.size, q.y], [q.x + q.size, q.y + q.size], [q.x, q.y + q.size], [q.x, q.y]]] }));
  const layer = new GeoJSONWrapper(features as unknown as Feature[], { version: 2, extent: 4096 });
  layer.name = 'building';
  return fromVectorTileJs({ layers: { building: layer } } as never);
}
const countOf = (bytes: Uint8Array) => new VectorTile(new PbfReader(bytes)).layers.building?.length ?? 0;

describe('the model has priority over the OSM building', () => {
  const tile = { z: 14, x: 4825, y: 6156 };
  // a footprint (lng/lat) that covers the pixel square 1000..1400 of the tile
  const at = (px: number, py: number): [number, number] => {
    const n = 2 ** tile.z;
    const lng = ((tile.x + px / 4096) / n) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (tile.y + py / 4096)) / n))) * 180) / Math.PI;
    return [lng, lat];
  };
  const footprint = { geometry: [[[at(980, 980), at(1420, 980), at(1420, 1420), at(980, 1420), at(980, 980)]]] as never, ids: [] as number[] };

  it('cuts a merged building (id ending in 0) out spatially and leaves the others', () => {
    const bytes = tileWith([{ id: 100, x: 1000, y: 1000, size: 400 }, { id: 200, x: 3000, y: 3000, size: 400 }]);
    expect(countOf(bytes)).toBe(2);
    expect(countOf(replaceBuildingTile(bytes, tile, [footprint]))).toBe(1);
    expect(countOf(replaceBuildingTile(bytes, tile, []))).toBe(2);
  });
  it('drops an unmerged building by its feature id', () => {
    const bytes = tileWith([{ id: 342, x: 3000, y: 3000, size: 400 }, { id: 352, x: 200, y: 200, size: 300 }]);
    expect(countOf(replaceBuildingTile(bytes, tile, [{ geometry: [], ids: [342] }]))).toBe(1);
  });
  it('knows the pixel of a coordinate and whether a point lies in an outline', () => {
    const [px, py] = tilePoint(at(1000, 2000), tile, 4096);
    expect(px).toBeCloseTo(1000, 3);
    expect(py).toBeCloseTo(2000, 3);
    const [lng, lat] = at(1200, 1200);
    expect(inFootprint(lng, lat, footprint.geometry)).toBe(true);
    expect(inFootprint(...at(2000, 2000), footprint.geometry)).toBe(false);
  });
  it('leaves the detailed buildings out by their outline, or by the footprint box without one', () => {
    const items = parseLandmarks({ assets: [ESB] });
    const ring = (lng: number, lat: number): [number, number][][] => [[[lng, lat], [lng + 1e-4, lat], [lng + 1e-4, lat + 1e-4], [lng, lat]]];
    const boxMask = maskOf(items);
    expect(replacedByLandmark({ rings: ring(-73.985, 40.748) }, boxMask)).toBe(true);
    expect(replacedByLandmark({ rings: ring(-73.9, 40.7) }, boxMask)).toBe(false);
    expect(replacedByLandmark({ rings: ring(-73.985, 40.748) }, maskOf([]))).toBe(false);
    // with an outline that is smaller than the box, a house in the box but outside of it stays
    const shape = [[[[-73.9862, 40.7483], [-73.9858, 40.7483], [-73.9858, 40.7487], [-73.9862, 40.7487], [-73.9862, 40.7483]]]] as never;
    const shaped = maskOf(items, { 'empire-state-building': shape });
    expect(replacedByLandmark({ rings: ring(-73.9860, 40.7484) }, shaped)).toBe(true);
    expect(replacedByLandmark({ rings: ring(-73.9850, 40.7480) }, shaped)).toBe(false);
    expect(inBoxes(-73.985, 40.748, boxMask.boxes)).toBe(true);
  });
});
