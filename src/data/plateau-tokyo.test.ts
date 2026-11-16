import { describe, expect, it } from 'vitest';
import { PLATEAU_ATTRIBUTION, PLATEAU_LICENSE, PLATEAU_TOKYO } from './plateau-tokyo';

describe('Plateau Tokyo catalogue', () => {
  it('has the 23 wards with unique ids', () => {
    expect(PLATEAU_TOKYO).toHaveLength(23);
    expect(new Set(PLATEAU_TOKYO.map((t) => t.id)).size).toBe(23);
  });
  it('has valid boxes around Tokyo, the centre inside', () => {
    for (const t of PLATEAU_TOKYO) {
      const [w, s, e, n] = t.bbox;
      expect(w).toBeLessThan(e);
      expect(s).toBeLessThan(n);
      expect(w).toBeGreaterThan(139.4);
      expect(e).toBeLessThan(140);
      expect(s).toBeGreaterThan(35.4);
      expect(n).toBeLessThan(36);
      expect(t.center[0]).toBeGreaterThan(w);
      expect(t.center[0]).toBeLessThan(e);
      expect(t.center[1]).toBeGreaterThan(s);
      expect(t.center[1]).toBeLessThan(n);
    }
  });
  it('names a https tileset, the source and the licence for each', () => {
    expect(PLATEAU_ATTRIBUTION).not.toBe('');
    expect(PLATEAU_LICENSE).not.toBe('');
    for (const t of PLATEAU_TOKYO) {
      expect(t.url).toMatch(/^https:\/\/.+\/tileset\.json$/);
      expect(t.attribution).toBe(PLATEAU_ATTRIBUTION);
      expect(t.license).toBe(PLATEAU_LICENSE);
      expect(t.heightOffsetM).toBeLessThan(0);
    }
  });
});
