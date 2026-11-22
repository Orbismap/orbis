import { describe, expect, it } from 'vitest';
import { AERIAL_IDS, BASEMAPS, BASEMAP_IDS, KARTE_IDS, MODE_IDS, DEFAULT_BASEMAP, isBasemapId, modeForBasemap } from '.';
import { BASEMAP_CREDITS } from '../../features/attribution/credits';
import { parseHash } from '../../core/url';

describe('basemap registry', () => {
  it('ids, groups, defs and credits agree and are URL-safe', () => {
    expect(new Set(BASEMAP_IDS).size).toBe(BASEMAP_IDS.length);
    expect(Object.keys(BASEMAPS).sort()).toEqual([...BASEMAP_IDS].sort());
    expect(Object.keys(BASEMAP_CREDITS).sort()).toEqual([...BASEMAP_IDS].sort());
    expect(BASEMAP_IDS).toContain(DEFAULT_BASEMAP);
    for (const id of BASEMAP_IDS) {
      expect(id).toMatch(/^[a-z0-9-]{1,32}$/);
      expect(BASEMAPS[id].id).toBe(id);
      expect(isBasemapId(id)).toBe(true);
      expect(BASEMAP_CREDITS[id].length).toBeGreaterThan(0);
      for (const l of BASEMAPS[id].layers) expect(l.id.startsWith(`bm-${id}-`)).toBe(true);
      expect(parseHash(`#/?b=${id}`).basemap).toBe(id);
    }
    // every global map is in exactly one of the two lists the picker shows
    expect(KARTE_IDS.filter((id) => AERIAL_IDS.includes(id))).toEqual([]);
    expect(new Set([...KARTE_IDS, ...AERIAL_IDS]).size).toBe(KARTE_IDS.length + AERIAL_IDS.length);
    // the modes' own maps are not in the Daten list, but still part of the composed style
    expect(MODE_IDS).toEqual(['orbis-karte', 'orbis-fahren']);
    expect(MODE_IDS.filter((id) => [...KARTE_IDS, ...AERIAL_IDS].includes(id))).toEqual([]);
    expect(modeForBasemap('orbis-karte')).toBe('erkunden');
    expect(modeForBasemap('orbis-fahren')).toBe('fahren');
    expect(modeForBasemap('orbis-dark')).toBe('daten');
    expect(modeForBasemap('satellite')).toBe('luftbild');
  });
  it('regional basemaps carry bounds, keyless tile URLs only', () => {
    for (const id of ['swissimage', 'swissalti3d', 'swisssurface3d', 'imagico-alps'] as const) {
      const src = Object.values(BASEMAPS[id].sources)[0] as { bounds?: number[] };
      expect(src.bounds).toHaveLength(4);
    }
    for (const id of BASEMAP_IDS) for (const s of Object.values(BASEMAPS[id].sources)) {
      for (const t of (s as { tiles?: string[] }).tiles ?? []) expect(t).not.toMatch(/key|token/i);
    }
    expect((Object.values(BASEMAPS['imagico-alps'].sources)[0] as { scheme?: string }).scheme).toBe('tms');
  });
});
