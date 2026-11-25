import { describe, expect, it } from 'vitest';
import { dayOfYear, makeFlock, positionAt, type Phase } from './flock';
import { SPECIES } from './species';
import type { LngLat } from './species';

const out: LngLat = [0, 0];

describe('Tierzüge', () => {
  it('Tage im Jahr', () => {
    expect(dayOfYear(Date.UTC(2026, 0, 1))).toBe(1);
    expect(dayOfYear(Date.UTC(2026, 6, 2, 12))).toBeCloseTo(183.5, 5);
  });
  it('Tiere sind bei jedem Aufruf dieselben', () => {
    const sp = SPECIES[0]!;
    const a = makeFlock(sp, 5);
    const b = makeFlock(sp, 5);
    expect(a.map((x) => x.a0)).toEqual(b.map((x) => x.a0));
  });
  it('jede Art durchläuft alle vier Phasen mit gültigen Koordinaten, ohne Sprünge', () => {
    for (const sp of SPECIES) {
      const seen = new Set<Phase>();
      const bad: string[] = [];
      for (const bird of makeFlock(sp, 30)) {
        let prev: LngLat | undefined;
        for (let d = 1; d <= 365; d += 0.5) {
          seen.add(positionAt(bird, d, out));
          if (!(out[0] >= -180 && out[0] < 180 && Math.abs(out[1]) <= 85)) bad.push(`${sp.id} ${d}: ${out}`);
          if (prev) {
            let dx = Math.abs(out[0] - prev[0]);
            if (dx > 180) dx = 360 - dx;
            // in einem halben Tag höchstens 15 Grad (die Pfuhlschnepfe schafft rund 5)
            if (Math.hypot(dx, out[1] - prev[1]) > 15) bad.push(`${sp.id} ${d}: Sprung`);
          }
          prev = [out[0], out[1]];
        }
      }
      expect(bad.slice(0, 3)).toEqual([]);
      expect([...seen].sort()).toEqual(['brut', 'fruehjahr', 'herbst', 'winter']);
    }
  });
  it('Weißstörche brüten im Sommer in Europa und überwintern in Afrika', () => {
    const storks = makeFlock(SPECIES.find((s) => s.id === 'weissstorch')!, 60);
    for (const b of storks) {
      positionAt(b, 170, out);
      expect(out[1]).toBeGreaterThan(40);
      positionAt(b, 360, out);
      expect(out[1]).toBeLessThan(25);
    }
  });
});
