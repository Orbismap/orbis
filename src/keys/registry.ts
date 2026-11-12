// Collects all key definitions (src/keys/defs/<id>.ts, default export = defineKey({...})).
import type { KeyDef, KeyGroupId } from './types';

type Mods = Record<string, { default?: KeyDef }>;

/** Builds the registry from a glob result; checks that id === file name. Exported for tests. */
export function buildKeyRegistry(mods: Mods, onError: (msg: string) => void = (m) => console.error(`[keys] ${m}`)): Map<string, KeyDef> {
  const out = new Map<string, KeyDef>();
  for (const [path, mod] of Object.entries(mods)) {
    const m = /\/([^/]+)\.ts$/.exec(path);
    const def = mod.default;
    if (!m || !def) {
      onError(`${path}: keine Schlüsseldefinition exportiert (export default defineKey({...}))`);
      continue;
    }
    if (def.id !== m[1]) {
      onError(`${path}: id "${def.id}" entspricht nicht dem Dateinamen "${m[1]}"`);
      continue;
    }
    if (out.has(def.id)) {
      onError(`${path}: doppelte id "${def.id}"`);
      continue;
    }
    out.set(def.id, def);
  }
  return out;
}

const registry = buildKeyRegistry(import.meta.glob<{ default?: KeyDef }>(['./defs/*.ts', '!./defs/*.test.ts'], { eager: true }));

export const allKeys = (): KeyDef[] => [...registry.values()];
export const getKeyDef = (id: string): KeyDef | undefined => registry.get(id);

export const KEY_GROUPS: { id: KeyGroupId; title: string }[] = [
  { id: 'verkehr', title: 'Verkehr' },
  { id: 'kameras', title: 'Kameras' },
  { id: 'wetter', title: 'Wetter' },
  { id: 'karte', title: 'Karten' },
  { id: 'dienste', title: 'Dienste' },
];

/** Keys grouped in display order; empty groups are omitted. */
export function keysByGroup(): { group: (typeof KEY_GROUPS)[number]; keys: KeyDef[] }[] {
  return KEY_GROUPS.map((group) => ({ group, keys: allKeys().filter((k) => k.group === group.id).sort((a, b) => a.name.localeCompare(b.name, 'de')) })).filter((g) => g.keys.length);
}
