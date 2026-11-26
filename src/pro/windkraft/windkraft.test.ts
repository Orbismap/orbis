import { describe, expect, it } from 'vitest';
import { NACELLE_ROTOR_M, ROTOR_Y, nacelleGeometry, rotorGeometry, towerGeometry, turbineSize } from './models';

describe('wind turbine sizes', () => {
  it('grow with the rated power and keep the blades off the ground', () => {
    let last = turbineSize(0.001);
    for (let mw = 0.05; mw <= 20; mw += 0.05) {
      const s = turbineSize(mw);
      expect(s.rotorM).toBeGreaterThanOrEqual(last.rotorM);
      expect(s.hubM - s.rotorM / 2).toBeGreaterThan(5);
      last = s;
    }
  });

  it('assumes a 2 MW machine for untagged turbines and clamps absurd values', () => {
    expect(turbineSize()).toEqual(turbineSize(2));
    expect(turbineSize(3000)).toEqual(turbineSize(15));
    expect(turbineSize(0.000001)).toEqual(turbineSize(0.01));
  });
});

describe('wind turbine models', () => {
  const parts = { tower: towerGeometry(), nacelle: nacelleGeometry(), rotor: rotorGeometry() };
  for (const [name, g] of Object.entries(parts)) {
    it(`${name}: finite and cheap enough for thousands`, () => {
      const pos = g.getAttribute('position');
      expect(pos.count % 3).toBe(0);
      expect((pos.array as Float32Array).every(Number.isFinite)).toBe(true);
      expect((g.getAttribute('normal').array as Float32Array).every(Number.isFinite)).toBe(true);
      expect(pos.count / 3).toBeLessThan(250);
    });
  }

  it('has a unit tower, a unit rotor, and the rotor in front of the tower', () => {
    for (const g of Object.values(parts)) g.computeBoundingBox();
    expect(parts.tower.boundingBox!.max.z).toBeCloseTo(1);
    const r = parts.rotor.boundingBox!;
    expect(r.max.z).toBeCloseTo(0.5, 2);
    expect(Math.max(r.max.x, -r.min.x)).toBeLessThanOrEqual(0.5);
    // the tower's top (radius in metres for this rotor) stays behind the rotor plane
    expect(ROTOR_Y).toBeGreaterThan(NACELLE_ROTOR_M * 0.027 * 0.6);
    expect(parts.nacelle.boundingBox!.max.y).toBeGreaterThan(ROTOR_Y);
  });
});
