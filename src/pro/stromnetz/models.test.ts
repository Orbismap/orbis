import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DESIGNS, SLOTS, type DesignId } from './designs';
import { buildDesign } from './models';

const ids = Object.keys(DESIGNS) as DesignId[];

describe('tower models', () => {
  for (const id of ids) {
    it(`${id}: finite, as high as its design, wires attach inside the model`, () => {
      const g = buildDesign(id);
      const pos = g.getAttribute('position');
      expect(pos.count % 3).toBe(0);
      expect(pos.count).toBeGreaterThan(30);
      expect(pos.array.every(Number.isFinite)).toBe(true);
      expect((g.getAttribute('normal').array as Float32Array).every(Number.isFinite)).toBe(true);
      g.computeBoundingBox();
      const box = g.boundingBox!;
      const spec = DESIGNS[id];
      expect(box.min.z).toBeGreaterThanOrEqual(-0.5);
      // the highest part is the earth peak or the top pin, within a metre of the design height
      expect(box.max.z).toBeGreaterThan(spec.h - 1.5);
      expect(box.max.z).toBeLessThan(spec.h + 1.5);
      // every wire point lies within the model's reach and below its top
      const wide = new THREE.Box3(new THREE.Vector3(box.min.x - 0.5, -50, 0), new THREE.Vector3(box.max.x + 0.5, 50, spec.h + 1));
      for (const s of SLOTS[id]) expect(wide.containsPoint(new THREE.Vector3(s.x, 0, s.z))).toBe(true);
    });
  }

  it('has a wire point for every conductor of the systems it carries', () => {
    for (const id of ids) {
      const conductors = SLOTS[id].filter((s) => !s.earth);
      expect(conductors.length).toBe(DESIGNS[id].circuits * 3);
      for (let c = 0; c < DESIGNS[id].circuits; c++) expect(conductors.filter((s) => s.circuit === c)).toHaveLength(3);
    }
  });

  it('keeps the triangle count of a tower low enough for thousands of them', () => {
    for (const id of ids) expect(buildDesign(id).getAttribute('position').count / 3).toBeLessThan(2500);
  });
});
