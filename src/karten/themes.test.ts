import { describe, expect, it } from 'vitest';
import { allLayers, hasLayer } from '../layers/registry';
import { STANDARD_DEFS } from './standard';

describe('themes of the standard Karten', () => {
  const themes = STANDARD_DEFS.flatMap((k) => (k.themes ?? []).map((t) => ({ karte: k.id, ...t })));
  it('only name layers that exist', () => {
    const missing = themes.flatMap((t) => t.layers.filter((id) => !hasLayer(id)).map((id) => `${t.karte}/${t.id}: ${id}`));
    expect(missing).toEqual([]);
  });
  // Layers deliberately left out of all topics (still reachable via the catalog).
  const NOT_IN_THEMES = new Set([
    'radar-de', // subset of 'radar'
  ]);
  it('cover every layer at least once', () => {
    const used = new Set(themes.flatMap((t) => t.layers));
    expect(allLayers().map((l) => l.id).filter((id) => !used.has(id) && !NOT_IN_THEMES.has(id))).toEqual([]);
  });
  it('has unique topic ids per Karte and no layer twice in one topic', () => {
    for (const k of STANDARD_DEFS) {
      const ids = (k.themes ?? []).map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const t of k.themes ?? []) expect(new Set(t.layers).size).toBe(t.layers.length);
    }
  });
});
