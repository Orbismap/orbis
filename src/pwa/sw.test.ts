// The service worker template, run against a stand-in for the browser's caches and network.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { API } from '../wetter/data/endpoints';

const template = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://bahn.example';

interface Req { url: string; method: string; mode: string; headers: Headers }

function worker(config: { version: string; required: string[]; optional: string[] }, stores = new Map<string, Map<string, Response>>()) {
  const urlOf = (r: string | Req) => new URL(typeof r === 'string' ? r : r.url, ORIGIN).href;
  const net = { online: true, answers: new Map<string, number>() };
  const open = async (name: string) => {
    const map = stores.get(name) ?? stores.set(name, new Map()).get(name)!;
    return {
      match: async (r: string | Req) => map.get(urlOf(r))?.clone(),
      put: async (r: string | Req, res: Response) => void (map.delete(urlOf(r)), map.set(urlOf(r), res)),
      keys: async () => [...map.keys()],
      delete: async (k: string) => map.delete(k),
    };
  };
  const caches = { open, keys: async () => [...stores.keys()], delete: async (k: string) => stores.delete(k) };
  const fetch = async (r: string | Req) => {
    if (!net.online) throw new TypeError('offline');
    const url = urlOf(r);
    return new Response(url, { status: net.answers.get(url) ?? 200 });
  };
  const on: Record<string, (e: unknown) => void> = {};
  const self = { location: { origin: ORIGIN }, clients: { claim: async () => {} }, skipWaiting: async () => {}, addEventListener: (t: string, f: (e: unknown) => void) => (on[t] = f) };
  new Function('CONFIG', 'self', 'caches', 'fetch', template)({ app: 'bahn', ...config }, self, caches, fetch);

  const lifecycle = async (type: 'install' | 'activate') => {
    let done: Promise<unknown> = Promise.resolve();
    on[type]!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  /** The worker's answer, or `network` when it leaves the request to the browser. */
  const get = async (url: string, mode = 'cors', cache?: RequestCache) => {
    let answer: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    on.fetch!({ request: { url: urlOf(url), method: 'GET', mode, cache, headers: new Headers() }, respondWith: (p: Promise<Response>) => (answer = p), waitUntil: (p: Promise<unknown>) => waits.push(p) });
    if (!answer) return 'network';
    const res = await answer;
    await Promise.all(waits);
    return res;
  };
  return { net, stores, lifecycle, get };
}

const v1 = { version: '1', required: ['/', '/assets/app.js'], optional: ['/bahn/favicon.svg'] };
const TILE = 'https://tiles.example/1/2/3.pbf';
const status = (r: Response | string) => (typeof r === 'string' ? r : r.type === 'error' ? 'error' : r.status);

describe('service worker', () => {
  it('leaves requests that ask for the server’s state to the browser', async () => {
    const sw = worker(v1);
    await sw.lifecycle('install');
    expect(await sw.get(TILE, 'cors', 'no-store')).toBe('network');
  });
  it('starts the app and shows what was seen without a network', async () => {
    const sw = worker(v1);
    await sw.lifecycle('install');
    await sw.get(TILE);
    sw.net.online = false;
    expect(status(await sw.get('/?x=1', 'navigate'))).toBe(200);
    expect(status(await sw.get('/assets/app.js'))).toBe(200);
    expect(status(await sw.get(TILE))).toBe(200);
    expect(status(await sw.get('https://tiles.example/9/9/9.pbf'))).toBe('error');
  });

  it('leaves live data to the app', async () => {
    const sw = worker(v1);
    // the warnings as the app asks for them: setting the bbox re-encodes the whole query
    const warnings = new URL(API.warnings);
    warnings.searchParams.set('bbox', '1,2,3,4');
    for (const url of ['https://api.transitous.org/api/v5/stoptimes?stopId=a', `${API.forecast}?latitude=1`, `${API.airQuality}?latitude=1`, warnings.toString()])
      expect(await sw.get(url)).toBe('network');
  });

  it('keeps weather fields, which never change, and does not store failures', async () => {
    const sw = worker(v1);
    const field = 'https://r2.example/v1/run/t/o.owx';
    await sw.get(field);
    sw.net.answers.set(field, 500);
    expect(status(await sw.get(field))).toBe(200);
    sw.net.answers.set(TILE, 404);
    expect(status(await sw.get(TILE))).toBe(404);
    sw.net.online = false;
    expect(status(await sw.get(TILE))).toBe('error');
  });

  it('keeps what was seen across an update and drops the old app files', async () => {
    const old = worker(v1);
    await old.lifecycle('install');
    await old.get(TILE);
    const next = worker({ ...v1, version: '2' }, old.stores);
    await next.lifecycle('install');
    await next.lifecycle('activate');
    expect([...next.stores.keys()].sort()).toEqual(['orbis-bahn-runtime', 'orbis-bahn-shell-2']);
  });

  it('does not install with a file of the app missing', async () => {
    const sw = worker(v1);
    sw.net.answers.set(`${ORIGIN}/assets/app.js`, 404);
    await expect(sw.lifecycle('install')).rejects.toThrow('404');
    sw.net.answers.set(`${ORIGIN}/assets/app.js`, 200);
    sw.net.answers.set(`${ORIGIN}/bahn/favicon.svg`, 404);
    await expect(sw.lifecycle('install')).resolves.toBeUndefined();
  });
});
