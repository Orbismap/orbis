import { describe, expect, it } from 'vitest';
import { PLATEAU_ATTRIBUTION, PLATEAU_LICENSE, geoidHeight, loadPlateau } from './plateau';

describe('Plateau catalogue', () => {
  it('has hundreds of models with unique ids', async () => {
    const all = await loadPlateau();
    expect(all.length).toBeGreaterThan(400);
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
  });
  it('contains all 23 wards of Tokyo, LOD2', async () => {
    const tokyo = (await loadPlateau()).filter((t) => t.id.startsWith('plateau-131'));
    expect(tokyo).toHaveLength(23);
    expect(tokyo.every((t) => t.lod === 2)).toBe(true);
  });
  it('has valid boxes in Japan, the centre inside', async () => {
    for (const t of await loadPlateau()) {
      const [w, s, e, n] = t.bbox;
      expect(w).toBeLessThan(e);
      expect(s).toBeLessThan(n);
      expect(w).toBeGreaterThan(120);
      expect(e).toBeLessThan(155);
      expect(s).toBeGreaterThan(20);
      expect(n).toBeLessThan(47);
      expect(t.center[0]).toBeGreaterThan(w);
      expect(t.center[1]).toBeLessThan(n);
    }
  });
  it('names a https tileset, the source and the licence for each, and lowers it by the geoid', async () => {
    for (const t of await loadPlateau()) {
      expect(t.url).toMatch(/^https:\/\/.+\/tileset\.json$/);
      expect(t.attribution).toBe(PLATEAU_ATTRIBUTION);
      expect(t.license).toBe(PLATEAU_LICENSE);
      expect(t.heightOffsetM).toBeLessThan(-15);
      expect(t.heightOffsetM).toBeGreaterThan(-45);
    }
  });
  it('geoid height: Tokyo as measured, smooth elsewhere', () => {
    expect(geoidHeight(139.7, 35.68)).toBeCloseTo(36.7, 0);
    expect(geoidHeight(135.5, 34.69)).toBeGreaterThan(30);
  });
});
