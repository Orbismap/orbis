// Persistent cache for API payloads (localStorage through core/storage). Keeps a small index so that old entries are
// evicted and the quota is never filled by blocks of a long panning session.
import { getJSON, removeKey, setJSON } from '../../core/storage';

interface Entry<T> { t: number; d: T }
const INDEX = 'ocean-cache-index';

export function cacheGet<T>(key: string, maxAgeMs: number, now = Date.now()): Entry<T> | undefined {
  const e = getJSON<Entry<T> | undefined>(`oc:${key}`, 1, (r) => (r && typeof (r as Entry<T>).t === 'number' ? (r as Entry<T>) : undefined), undefined);
  return e && now - e.t <= maxAgeMs ? e : undefined;
}

export function cachePut<T>(key: string, data: T, maxEntries = 48, now = Date.now()): void {
  const ok = setJSON<Entry<T>>(`oc:${key}`, 1, { t: now, d: data });
  const idx = getJSON<string[]>(INDEX, 1, (r) => (Array.isArray(r) ? (r as string[]) : undefined), []);
  const next = [...idx.filter((k) => k !== key), key];
  while (next.length > maxEntries) removeKey(`oc:${next.shift()!}`);
  setJSON(INDEX, 1, next);
  if (!ok) {
    // quota: drop the oldest half and try once more
    for (const k of next.splice(0, Math.ceil(next.length / 2))) removeKey(`oc:${k}`);
    setJSON(INDEX, 1, next);
    setJSON<Entry<T>>(`oc:${key}`, 1, { t: now, d: data });
  }
}
