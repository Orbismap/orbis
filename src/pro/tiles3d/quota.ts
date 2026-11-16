// Counts the root requests of Cesium ion tilesets per calendar month (the Community plan allows 1,000 for the Google tiles).
// Kept in this browser only; every start of a tileset is one request. Never throws: without storage the count is just this session's.
const KEY = 'orbis-ion-roots';
export const ION_ROOT_LIMIT = 1000;

interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void }
let memory = { month: '', n: 0 };
const monthOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const storage = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export function rootsThisMonth(now = new Date(), store: Store | null = storage()): number {
  const month = monthOf(now);
  try {
    const v = JSON.parse(store?.getItem(KEY) ?? 'null') as { month?: string; n?: number } | null;
    if (v && v.month === month && typeof v.n === 'number') return v.n;
  } catch { /* unreadable: counted from zero */ }
  return memory.month === month ? memory.n : 0;
}

/** One more root request; returns the new count of the month. */
export function countRoot(now = new Date(), store: Store | null = storage()): number {
  const month = monthOf(now);
  const n = rootsThisMonth(now, store) + 1;
  memory = { month, n };
  try { store?.setItem(KEY, JSON.stringify({ month, n })); } catch { /* storage full or blocked */ }
  return n;
}

/** What a failed ion request means for the user. */
export function ionProblem(message: string): string | undefined {
  if (/\b429\b/.test(message)) return 'Tageslimit von Cesium oder Google erreicht (gilt für alle Nutzer des kostenlosen Plans), morgen wieder; bis dahin hilft „Gebäude (OpenStreetMap)“.';
  if (/\b(401|403)\b/.test(message)) return 'Cesium lehnt den Token ab: prüfe, ob er Leserechte hat und das Asset unter „My Assets“ liegt.';
  return undefined;
}
