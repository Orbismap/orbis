import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lastKnown } from './lastKnown';

/** localStorage with room for `room` characters. */
export function fakeStorage(room = Infinity) {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const used = [...map].reduce((n, [key, value]) => (key === k ? n : n + value.length), 0);
      if (used + v.length > room) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

describe('lastKnown', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('returns what was saved last, with its time', () => {
    const store = lastKnown<number[]>('t', 3);
    expect(store.get('a')).toBeUndefined();
    store.put('a', [1], 100);
    store.put('a', [2], 200);
    expect(store.get('a')).toEqual({ at: 200, data: [2] });
  });

  it('drops the entry written longest ago beyond the limit', () => {
    const store = lastKnown<string>('t', 2);
    store.put('a', 'A');
    store.put('b', 'B');
    store.put('a', 'A2');
    store.put('c', 'C');
    expect(store.get('b')).toBeUndefined();
    expect(store.get('a')?.data).toBe('A2');
    expect(store.get('c')?.data).toBe('C');
  });

  it('makes room when the storage is full', () => {
    vi.stubGlobal('localStorage', fakeStorage(160));
    const store = lastKnown<string>('t', 10);
    store.put('a', 'x'.repeat(60), 1);
    store.put('b', 'y'.repeat(60), 2);
    expect(store.get('a')).toBeUndefined();
    expect(store.get('b')?.at).toBe(2);
  });

  it('survives a missing storage', () => {
    vi.stubGlobal('localStorage', undefined);
    const store = lastKnown<string>('t', 2);
    expect(() => store.put('a', 'A')).not.toThrow();
    expect(store.get('a')).toBeUndefined();
  });
});
