import { fromGeojsonVt } from '@maplibre/vt-pbf';
import { describe, expect, it } from 'vitest';
import { pointsIn, tileOf } from '@/data/tilePoints';
import { BAKERY, TOILETS } from '../data/kinds';
import { withOffline } from '../state/tiles';
import { MAX_ZOOM, tilesFor, touches, type Shape } from './area';
import { citiesIn } from './boundary';
import type { OfflineStore, Region, StoredTile } from './db';
import { MAP_LAYERS, MAX_TILES, TooLarge, download, estimate, estimatedBytes, removeRegion, sweep } from './download';
import { gunzip } from './gzip';
import { answer, mapRequest } from './protocol';
import { savedPoints } from './read';
import type { Upstream } from './sources';
import { keepLayers } from './vtile';

function memory(): OfflineStore & { tiles: Map<string, StoredTile>; fonts: Map<string, Uint8Array<ArrayBuffer>> } {
  const list = new Map<string, Region>();
  const tiles = new Map<string, StoredTile>();
  const fonts = new Map<string, Uint8Array<ArrayBuffer>>();
  return {
    tiles, fonts,
    regions: async () => [...list.values()],
    putRegion: async (r) => void list.set(r.id, r),
    deleteRegion: async (id) => void list.delete(id),
    getTile: async (d, k) => tiles.get(`${d} ${k}`),
    putTile: async (d, k, t) => void tiles.set(`${d} ${k}`, t),
    deleteTiles: async (d) => { for (const k of tiles.keys()) if (k.startsWith(`${d} `)) tiles.delete(k); },
    tileSets: async () => [...new Set([...tiles.keys()].map((k) => k.split(' ')[0]!))],
    getFont: async (p) => fonts.get(p),
    putFont: async (p, d) => void fonts.set(p, d),
    deleteFonts: async () => fonts.clear(),
  };
}

/** a tile with a street, and places: a bakery, a toilet and a bank */
function vectorTile(): Uint8Array<ArrayBuffer> {
  const point = (subclass: string, name?: string) => ({ type: 1, geometry: [[2000, 2000]], tags: { class: subclass, subclass, ...(name ? { name } : {}), rank: 5 } });
  const layer = (features: unknown[]) => ({ features });
  return new Uint8Array(fromGeojsonVt({
    transportation: layer([{ type: 2, geometry: [[[0, 0], [100, 100]]], tags: { class: 'minor' } }]),
    poi: layer([point('bakery', 'Korn'), point('toilets'), point('bank')]),
    housenumber: layer([point('1')]),
  } as never));
}

const box: Shape = { type: 'box', box: [11.39, 53.62, 11.43, 53.64] };
function source(fail: () => boolean = () => false): Upstream {
  return {
    tile: async () => { if (fail()) throw new Error('netz'); return vectorTile(); },
    font: async () => new Uint8Array([1, 2, 3]),
    setPoints: async () => [],
  };
}
const order = { name: 'Schwerin', shape: box, kinds: [BAKERY.id] };

describe('area', () => {
  it('covers every zoom, with one tile at the top', () => {
    const tiles = tilesFor(box, MAX_TILES)!;
    expect(tiles[0]).toEqual({ z: 0, x: 0, y: 0 });
    expect(new Set(tiles.map((t) => t.z)).size).toBe(MAX_ZOOM + 1);
  });
  it('gives up on an area that is too large', () => {
    expect(tilesFor({ type: 'box', box: [5, 47, 15, 55] }, MAX_TILES)).toBeNull();
  });
  it('takes only the tiles that touch an outline, also one inside it, none in a hole', () => {
    const triangle: [number, number][] = [[11, 53], [12, 53], [11, 54], [11, 53]];
    const outline = tilesFor({ type: 'outline', box: [11, 53, 12, 54], polygons: [[triangle]] }, 20_000)!;
    const full = tilesFor({ type: 'box', box: [11, 53, 12, 54] }, 20_000)!;
    expect(outline.length).toBeLessThan(full.length * 0.65);
    expect(touches([11.1, 53.1, 11.11, 53.11], [[triangle]])).toBe(true);
    const hole: [number, number][] = [[11.05, 53.05], [11.3, 53.05], [11.3, 53.3], [11.05, 53.3]];
    expect(touches([11.1, 53.1, 11.11, 53.11], [[triangle, hole]])).toBe(false);
  });
  it('reads city outlines and leaves out places without an area', () => {
    const cities = citiesIn([
      { osm_type: 'relation', osm_id: 1, name: 'Schwerin', display_name: 'Schwerin, Mecklenburg-Vorpommern, Deutschland', geojson: { type: 'Polygon', coordinates: [[[11, 53], [12, 53], [12, 54], [11, 53]]] } },
      { name: 'Punkt', geojson: { type: 'Point', coordinates: [1, 2] } },
    ]);
    expect(cities).toHaveLength(1);
    expect(cities[0]).toMatchObject({ name: 'Schwerin', shape: { box: [11, 53, 12, 54] } });
  });
});

describe('download', () => {
  it('drops the layers the map does not draw and keeps the others readable', () => {
    const small = keepLayers(vectorTile(), MAP_LAYERS);
    expect(small.length).toBeLessThan(vectorTile().length);
    expect(pointsIn(small, 'poi', 14, 0, 0)).toEqual([]);
    expect(keepLayers(vectorTile(), new Set(['poi', 'transportation', 'housenumber']))).toEqual(vectorTile());
  });

  it('keeps the map and only the places of the chosen kinds', async () => {
    const store = memory();
    const region = await download(order, store, source());
    expect(region.tiles).toBe(tilesFor(box, MAX_TILES)!.length);
    expect(store.tiles.size).toBe(region.tiles);
    const [x, y] = tileOf(11.41, 53.63, 14);
    const bakeries = await savedPoints(store, BAKERY, x, y);
    expect(bakeries).toHaveLength(1);
    expect(bakeries![0]!.properties).toEqual({ class: 'bakery', subclass: 'bakery', name: 'Korn' });
    expect(await savedPoints(store, TOILETS, x, y)).toBeUndefined();
    const map = await store.getTile(region.data, `14/${x}/${y}`);
    expect(await gunzip(map!.map)).toEqual(keepLayers(vectorTile(), MAP_LAYERS));
  });

  it('never has more than four requests under way', async () => {
    let now = 0, most = 0;
    const slow: Upstream = { ...source(), tile: async () => { most = Math.max(most, ++now); await new Promise((r) => setTimeout(r, 1)); now--; return vectorTile(); } };
    await download(order, memory(), slow);
    expect(most).toBe(4);
  });

  it('keeps the old version when an update fails or is stopped', async () => {
    const store = memory();
    const first = await download(order, store, source());
    let calls = 0;
    await expect(download({ ...order, replaces: first }, store, source(() => ++calls > 5), { pause: 0 })).rejects.toThrow('netz');
    const ctl = new AbortController();
    await expect(download({ ...order, replaces: first }, store, source(), { signal: ctl.signal, onProgress: (done) => done > 6 && ctl.abort() })).rejects.toThrow();
    expect(await store.regions()).toEqual([first]);
    expect(await store.tileSets()).toEqual([first.data]);
  });

  it('replaces the data in an update and frees everything on delete', async () => {
    const store = memory();
    const first = await download(order, store, source(), { now: 1000 });
    const second = await download({ ...order, replaces: first }, store, source(), { now: 2000 });
    expect(second).toMatchObject({ id: first.id, createdAt: 1000, updatedAt: 2000 });
    expect(await store.tileSets()).toEqual([second.data]);
    await removeRegion(second, store);
    expect([await store.regions(), store.tiles.size, store.fonts.size]).toEqual([[], 0, 0]);
  });

  it('refuses areas over the limit and stops at the size limit', async () => {
    await expect(download({ ...order, shape: { type: 'box', box: [5, 47, 15, 55] } }, memory(), source())).rejects.toThrow(TooLarge);
    // random bytes do not compress: 1 MB per tile passes 50 MB
    const heavy = new Uint8Array(1_000_000);
    for (let i = 0; i < heavy.length; i += 65_536) crypto.getRandomValues(heavy.subarray(i, i + 65_536));
    // field 15 (unknown to the tile format), length 999996
    heavy.set([0x7a, 0xbc, 0x84, 0x3d]);
    const store = memory();
    const wide: Shape = { type: 'box', box: [11.2, 53.55, 11.5, 53.7] };
    await expect(download({ ...order, shape: wide }, store, { ...source(), tile: async () => heavy }, { pause: 0 })).rejects.toThrow(TooLarge);
    expect(store.tiles.size).toBe(0);
  }, 60_000);

  it('clears tiles an interrupted download left behind', async () => {
    const store = memory();
    const region = await download(order, store, source());
    await store.putTile('left-over', '0/0/0', { map: new Uint8Array() });
    await sweep(store);
    expect(await store.tileSets()).toEqual([region.data]);
  });

  it('estimates the size per kind and adds only the chosen ones', async () => {
    const e = await estimate(tilesFor(box, MAX_TILES)!, source());
    expect(e.kindBytes[BAKERY.id]).toBeGreaterThan(0);
    expect(estimatedBytes(e, [BAKERY.id])).toBe(e.mapBytes + e.kindBytes[BAKERY.id]!);
    expect(estimatedBytes(e, [])).toBe(e.mapBytes);
  });
});

describe('without a network', () => {
  it('answers the map from the saved tiles', async () => {
    const store = memory();
    await download(order, store, source());
    const dead = source(() => true);
    const tile = await mapRequest('findmap://tile/0/0/0', new AbortController().signal, store, dead, false);
    expect(tile).toEqual(keepLayers(vectorTile(), MAP_LAYERS));
    await expect(mapRequest('findmap://tile/14/1/1', new AbortController().signal, store, dead, false)).rejects.toThrow('netz');
    expect(await mapRequest('findmap://font/Noto%20Sans%20Regular/0-255', new AbortController().signal, store, { ...dead, font: async () => { throw new Error('netz'); } }, false)).toEqual(new Uint8Array([1, 2, 3]));
  });
  it('prefers the source while online and falls back when it fails', async () => {
    const signal = new AbortController().signal;
    const a = new Uint8Array([1]), b = new Uint8Array([2]);
    expect(await answer(async () => a, async () => b, signal, true)).toBe(a);
    expect(await answer(async () => { throw new Error(); }, async () => b, signal, true)).toBe(b);
    expect(await answer(async () => a, async () => { throw new Error('db'); }, signal, true)).toBe(a);
  });
  it('does not wait for a hanging network when there is a saved copy', async () => {
    const b = new Uint8Array([2]);
    expect(await answer(() => new Promise(() => {}), async () => b, new AbortController().signal, true, 20)).toBe(b);
  });
  it('searches the saved tiles; the own tile must be there, others may be missing', async () => {
    const place = [{ lng: 1, lat: 2, properties: {} }];
    const reader = () => withOffline(async () => { throw new Error('netz'); }, async (x) => (x === 1 ? place : undefined), () => false, new AbortController().signal);
    const r = reader();
    expect(await r(1, 0)).toBe(place);
    expect(await r(2, 0)).toEqual([]);
    await expect(reader()(2, 0)).rejects.toThrow('offline');
  });
});
