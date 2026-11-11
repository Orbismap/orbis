// Collects all layer files (src/layers/<category>/<id>.ts, default export = defineLayer({...})).
import { CATEGORIES } from './categories';
import type { CategoryId, LayerDef } from './types';

type Mods = Record<string, { default?: LayerDef }>;

/** Builds the registry from a glob result; checks that id === file name. Exported for tests. */
export function buildRegistry(mods: Mods, onError: (msg: string) => void = (m) => console.error(`[layers] ${m}`)): Map<string, LayerDef> {
  const out = new Map<string, LayerDef>();
  for (const [path, mod] of Object.entries(mods)) {
    const m = /\/([^/]+)\/([^/]+)\.ts$/.exec(path);
    const def = mod.default;
    if (!m || !def) {
      onError(`${path}: keine Ebene exportiert (export default defineLayer({...}))`);
      continue;
    }
    if (def.id !== m[2]) {
      onError(`${path}: id "${def.id}" entspricht nicht dem Dateinamen "${m[2]}"`);
      continue;
    }
    if (def.category !== m[1]) onError(`${path}: Ordner "${m[1]}" entspricht nicht der Kategorie "${def.category}"`);
    if (out.has(def.id)) {
      onError(`${path}: doppelte id "${def.id}"`);
      continue;
    }
    out.set(def.id, def);
  }
  return out;
}

const modules = import.meta.glob<{ default?: LayerDef }>(['./*/*.ts', '!./**/*.test.ts'], { eager: true });
const registry = buildRegistry(modules);

export const allLayers = (): LayerDef[] => [...registry.values()];
export const getLayer = (id: string): LayerDef | undefined => registry.get(id);
export const hasLayer = (id: string): boolean => registry.has(id);

/** Layers grouped by category in category order, sorted by title inside. Empty categories are omitted. */
export function layersByCategory(): { category: (typeof CATEGORIES)[number]; layers: LayerDef[] }[] {
  const by = new Map<CategoryId, LayerDef[]>();
  for (const d of registry.values()) (by.get(d.category) ?? by.set(d.category, []).get(d.category)!).push(d);
  return [...CATEGORIES]
    .sort((a, b) => a.order - b.order)
    .map((category) => ({ category, layers: (by.get(category.id) ?? []).sort((a, b) => a.title.localeCompare(b.title, 'de')) }))
    .filter((g) => g.layers.length);
}
