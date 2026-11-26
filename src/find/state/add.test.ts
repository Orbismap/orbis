// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, string>();
const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) };
const page = { origin: 'http://127.0.0.1:5183', hostname: '127.0.0.1', pathname: '/', search: '?mode=find', href: '', assign: vi.fn() };
const requests: { method: string; url: string; body?: string; auth?: string }[] = [];
let refuse = 0;

beforeEach(() => {
  vi.resetModules();
  memory.clear();
  requests.length = 0;
  refuse = 0;
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { location: page, addEventListener: () => {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    requests.push({ method: init.method ?? 'GET', url, body: init.body?.toString(), auth: (init.headers as Record<string, string> | undefined)?.Authorization });
    if (url.includes('/map.json')) return new Response(JSON.stringify({ elements: [] }));
    if (url.endsWith('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'fresh' }));
    if (refuse) return new Response('refused', { status: refuse });
    return new Response(url.endsWith('/changesets') ? '77' : url.endsWith('/nodes') ? '4711' : '');
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function load() {
  const sensors = await import('./sensors');
  sensors.position.value = { lng: 8, lat: 50, accuracy: 5 };
  return { add: await import('./add'), osm: await import('./osm'), own: await import('./own') };
}

describe('adding', () => {
  it('opens a change, creates the node, closes the change and remembers the entry', async () => {
    memory.set('find.osm.token.test', 'secret');
    const { add, own } = await load();
    add.startAdding();
    add.setValue('capacity', '6');
    await add.submit();
    expect(add.sending.value).toEqual({ state: 'done', id: 4711 });
    const writes = requests.filter((r) => r.method !== 'GET');
    expect(writes.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual(['POST /api/0.6/changesets', 'POST /api/0.6/nodes', 'PUT /api/0.6/changeset/77/close']);
    expect(writes.every((r) => r.auth === 'Bearer secret' && r.url.startsWith('https://master.apis.dev.openstreetmap.org/'))).toBe(true);
    expect(writes[1]!.body).toContain('<tag k="capacity" v="6"/><tag k="amenity" v="bicycle_parking"/>');
    expect(own.own.value).toMatchObject([{ set: 'fahrradparken', properties: { id: 4711, capacity: 6 } }]);
  });

  it('forgets a refused sign-in and says so', async () => {
    memory.set('find.osm.token.test', 'old');
    refuse = 401;
    const { add, osm, own } = await load();
    add.startAdding();
    await add.submit();
    expect(osm.token.value).toBeNull();
    expect(add.sending.value).toMatchObject({ state: 'error' });
    expect(own.own.value).toEqual([]);
  });

  it('signs in first, brings the draft back and sends nothing by itself', async () => {
    const { add, osm } = await load();
    add.startAdding();
    add.setValue('covered', 'yes');
    await add.submit();
    const target = new URL(page.assign.mock.lastCall![0] as string);
    expect(target.pathname).toBe('/oauth2/authorize');
    memory.set('find.osm.answer', `?code=abc&state=${target.searchParams.get('state')}`);
    add.stopAdding();
    await add.resumeAdding();
    expect(osm.token.value).toBe('fresh');
    expect(add.draft.value).toMatchObject({ lng: 8, lat: 50, values: { covered: 'yes' } });
    expect(requests.some((r) => r.url.includes('/changesets'))).toBe(false);
  });

  it('takes no answer with a foreign state', async () => {
    const { add, osm } = await load();
    add.startAdding();
    await add.submit();
    memory.set('find.osm.answer', '?code=abc&state=other');
    await add.resumeAdding();
    expect(osm.token.value).toBeNull();
    expect(requests.some((r) => r.url.endsWith('/oauth2/token'))).toBe(false);
  });
});
