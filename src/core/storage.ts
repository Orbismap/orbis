// Versioned localStorage JSON. Safe when storage is blocked (private mode, disabled cookies).
const PREFIX = 'orbis-map:';

interface Envelope<T> { v: number; d: T }

function store(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Reads `key`. Returns `fallback` when the key is missing, the version differs, the JSON is broken or
 * `validate` rejects the value. `validate` may also return a cleaned copy.
 */
export function getJSON<T>(key: string, version: number, validate: (raw: unknown) => T | undefined, fallback: T): T {
  try {
    const text = store()?.getItem(PREFIX + key);
    if (!text) return fallback;
    const env = JSON.parse(text) as Envelope<unknown>;
    if (!env || env.v !== version) return fallback;
    const ok = validate(env.d);
    return ok === undefined ? fallback : ok;
  } catch {
    return fallback;
  }
}

export function setJSON<T>(key: string, version: number, value: T): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(PREFIX + key, JSON.stringify({ v: version, d: value } satisfies Envelope<T>));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    store()?.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
