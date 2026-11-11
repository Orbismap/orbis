import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResource, _resourceCount } from './resource';

function mockFetch(handler: (url: string, n: number) => { status?: number; body?: unknown; lm?: string } | Error) {
  let n = 0;
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    const r = handler(String(url), n++);
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: r.lm ? { 'last-modified': r.lm } : {} });
  }) as typeof fetch;
}

const flush = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe('createResource', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shares one request per key and releases it with the last user', async () => {
    mockFetch(() => ({ body: { v: 1 }, lm: 'Tue, 10 Nov 2026 03:07:34 GMT' }));
    const a = createResource<{ v: number }>({ key: 'k1', url: 'https://x/a.json' });
    const b = createResource<{ v: number }>({ key: 'k1', url: 'https://x/a.json' });
    await flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(a.data.value).toEqual({ v: 1 });
    expect(b.data).toBe(a.data);
    expect(a.state.value).toBe('ready');
    expect(a.updatedAt.value).toBe(Date.parse('Tue, 10 Nov 2026 03:07:34 GMT'));
    a.dispose();
    expect(_resourceCount()).toBe(1);
    b.dispose();
    b.dispose();
    expect(_resourceCount()).toBe(0);
  });

  it('parses with a function and refreshes, keeping old data on failure', async () => {
    mockFetch((_, n) => (n === 1 ? new Error('down') : { body: { n } }));
    const r = createResource<number>({ key: 'k2', url: 'https://x/b.json', parse: (raw) => (raw as { n: number }).n, refresh: 60_000 });
    await flush();
    expect(r.data.value).toBe(0);
    await flush(60_000);
    expect(r.error.value).toBe('Quelle nicht erreichbar');
    expect(r.data.value).toBe(0);
    expect(r.state.value).toBe('ready');
    await flush(2_000); // first backoff
    expect(r.data.value).toBe(2);
    expect(r.error.value).toBeUndefined();
    r.dispose();
  });

  it('uses the fallback when the mirror fails', async () => {
    mockFetch(() => ({ status: 500 }));
    const r = createResource<string>({ key: 'k3', url: 'https://x/c.json', fallback: async () => 'original' });
    await flush();
    expect(r.data.value).toBe('original');
    r.dispose();
  });

  it('ends in error without data and retries with backoff', async () => {
    mockFetch(() => ({ status: 503 }));
    const r = createResource<unknown>({ key: 'k4', url: 'https://x/d.json' });
    await flush();
    expect(r.state.value).toBe('error');
    expect(r.error.value).toMatch(/503/);
    await flush(2_000 + 8_000 + 30_000);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    await flush(120_000);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4); // stops after the backoff list for one-shot resources
    r.dispose();
  });
});
