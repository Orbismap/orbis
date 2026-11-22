import { describe, expect, it } from 'vitest';
import { POI_CATEGORIES, POI_GROUPS, POI_ICON_SPECS, POI_OTHER, poiCategoryIdsOf, poiCategoryOf, poiColorOf, poiFilter, poiIconId, poiIconOf } from './poi';
import { POI_GLYPHS } from '../render/poi-icon-paths';

// The POI tables are the single source of truth for filter, badge, colour and zoom tier: a duplicate id or a glyph
// without path data would silently show the wrong badge (or none at all) on the map.
describe('POI categories', () => {
  it('has unique group and category ids', () => {
    expect(new Set(POI_GROUPS.map((g) => g.id)).size).toBe(POI_GROUPS.length);
    expect(new Set(POI_CATEGORIES.map((c) => c.id)).size).toBe(POI_CATEGORIES.length);
  });

  it('maps every tile key to exactly one category', () => {
    const keys = new Map<string, string>();
    for (const c of POI_CATEGORIES) for (const k of c.keys) {
      expect(keys.has(k), `${k} in ${keys.get(k)} and ${c.id}`).toBe(false);
      keys.set(k, c.id);
    }
    expect(keys.size).toBeGreaterThan(150);
  });

  it('only points at groups and glyphs that exist', () => {
    const groups = new Set(POI_GROUPS.map((g) => g.id));
    for (const c of POI_CATEGORIES) {
      expect(groups.has(c.group), c.id).toBe(true);
      expect(POI_GLYPHS[c.glyph], `${c.id} -> ${c.glyph}`).toBeTypeOf('string');
      expect(c.tier).toBeGreaterThanOrEqual(1);
      expect(c.tier).toBeLessThanOrEqual(5);
    }
  });

  it('builds one badge per group and glyph, plus the fallback', () => {
    const ids = POI_ICON_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(POI_OTHER.icon);
    for (const s of POI_ICON_SPECS) expect(POI_GLYPHS[s.glyph], s.id).toBeTypeOf('string');
  });

  it('uses the subclass when it is more precise than the class', () => {
    expect(poiCategoryOf({ class: 'shop', subclass: 'bakery' })?.id).toBe('bakery');
    expect(poiCategoryOf({ class: 'railway', subclass: 'station' })?.id).toBe('station');
    expect(poiCategoryOf({ class: 'shop' })?.id).toBe('store');
    expect(poiCategoryOf({ class: 'unknown' })).toBeUndefined();
  });

  it('gives every feature an icon and a colour', () => {
    for (const c of POI_CATEGORIES) {
      expect(poiIconOf({ class: c.keys[0] })).toBe(poiIconId(c));
      expect(poiColorOf({ class: c.keys[0] })).toBe(c.color ?? POI_GROUPS.find((g) => g.id === c.group)!.color);
    }
    expect(poiIconOf({ class: 'unknown' })).toBe(POI_OTHER.icon);
    expect(poiColorOf({ class: 'unknown' })).toBe(POI_OTHER.color);
  });

  it('covers every category id in exactly one filter group', () => {
    const all = POI_GROUPS.flatMap((g) => poiCategoryIdsOf(g.id));
    expect(new Set(all).size).toBe(POI_CATEGORIES.length);
    expect(all.sort()).toEqual(POI_CATEGORIES.map((c) => c.id).sort());
  });

  it('filters by group and tier', () => {
    const essen = poiFilter('essen') as unknown[];
    expect(essen[essen.length - 1]).toEqual(['match', ['get', 'grp'], ['essen'], true, false]);
    const all = poiFilter() as unknown[];
    expect(all.length).toBe(essen.length - 1);
  });
});
