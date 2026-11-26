// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOILETS } from '../data/kinds';

const requests: string[] = [];
let status = 200;

beforeEach(() => {
  vi.resetModules();
  requests.length = 0;
  status = 200;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requests.push(url);
    if (url.endsWith('/planet')) return new Response(JSON.stringify({ tiles: ['https://tiles.example/v1/{z}/{x}/{y}.pbf'] }));
    return new Response(status === 200 ? new Uint8Array() : null, { status });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('base map tiles', () => {
  it('looks the address up once and keeps what it has read', async () => {
    const { tileReader } = await import('./tiles');
    const read = await tileReader(TOILETS, new AbortController().signal);
    expect(await read(5, 6)).toEqual([]);
    await read(5, 6);
    await (await tileReader(TOILETS, new AbortController().signal))(5, 6);
    expect(requests).toEqual(['https://tiles.openfreemap.org/planet', 'https://tiles.example/v1/14/5/6.pbf']);
  });

  it('takes a missing tile as empty and fails on a server error', async () => {
    const { tileReader } = await import('./tiles');
    const read = await tileReader(TOILETS, new AbortController().signal);
    status = 404;
    expect(await read(1, 1)).toEqual([]);
    status = 503;
    await expect(read(2, 2)).rejects.toThrow('503');
  });
});
