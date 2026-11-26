// The last answers of a source, kept on the device: shown while the fresh one is loading and when it cannot be reached (offline).
import { getJSON, removeKey, setJSON } from './storage';

export interface Known<T> {
  /** when the data arrived (ms) */
  at: number;
  data: T;
}

export interface LastKnown<T> {
  get(key: string): Known<T> | undefined;
  put(key: string, data: T, at?: number): void;
}

const isKnown = <T>(raw: unknown): Known<T> | undefined => {
  const k = raw as Known<T> | null;
  return k && Number.isFinite(k.at) && k.data !== undefined ? k : undefined;
};

/** A store of up to `limit` entries, the ones written longest ago give way first. Blocked or full storage only means "nothing saved". */
export function lastKnown<T>(name: string, limit: number): LastKnown<T> {
  const indexKey = `last:${name}`;
  const entryKey = (key: string) => `${indexKey}:${key}`;
  const index = () => getJSON<string[]>(indexKey, 1, (raw) => (Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : undefined), []);
  return {
    get: (key) => getJSON<Known<T> | undefined>(entryKey(key), 1, isKnown<T>, undefined),
    put(key, data, at = Date.now()) {
      const keys = [key, ...index().filter((k) => k !== key)];
      for (const old of keys.splice(limit)) removeKey(entryKey(old));
      // storage full: older entries make room
      while (!setJSON(entryKey(key), 1, { at, data }) && keys.length > 1) removeKey(entryKey(keys.pop()!));
      setJSON(indexKey, 1, keys);
    },
  };
}
