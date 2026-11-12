import { describe, expect, it } from 'vitest';
import { orbisDots, type OrbisVariant } from './orbis-dots';

const variants: OrbisVariant[] = ['logo', 'small', 'tiny', 'motion'];

describe('orbisDots', () => {
  it.each(variants)('%s: visible dots and exactly one hot at rot 0.5', (v) => {
    const d = orbisDots(v, 0.5);
    expect(d.length).toBeGreaterThan(0);
    expect(d.filter((x) => x.hot)).toHaveLength(1);
  });
  it('is deterministic', () => {
    expect(orbisDots('logo', 0.5)).toEqual(orbisDots('logo', 0.5));
  });
  it('the motion hot dot is a fixed point that travels with the sphere', () => {
    const a = orbisDots('motion', 0.5).find((x) => x.hot)!;
    const b = orbisDots('motion', 1.2).find((x) => x.hot);
    expect(b === undefined || b.cx !== a.cx).toBe(true);
  });
  it('stays inside the viewBox', () => {
    for (const d of orbisDots('logo')) {
      expect(d.cx).toBeGreaterThan(0);
      expect(d.cx).toBeLessThan(120);
    }
  });
});
