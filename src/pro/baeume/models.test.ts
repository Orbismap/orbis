import { describe, expect, it } from 'vitest';
import { SHAPES, TREE_H, buildTree } from './models';

describe('tree models', () => {
  for (const shape of SHAPES) {
    for (const detail of ['hoch', 'niedrig'] as const) {
      it(`${shape}/${detail}: finite, smooth, standing on the ground and about ${TREE_H} m high`, () => {
        const g = buildTree(shape, detail);
        for (const name of ['position', 'normal', 'color']) {
          const a = g.getAttribute(name);
          expect(a, name).toBeDefined();
          expect((a!.array as Float32Array).every(Number.isFinite)).toBe(true);
        }
        // smooth: vertices are shared between triangles
        expect(g.index).not.toBeNull();
        expect(g.getAttribute('position').count).toBeLessThan(g.index!.count);
        g.computeBoundingBox();
        const box = g.boundingBox!;
        expect(box.min.z).toBeGreaterThanOrEqual(-0.01);
        expect(box.min.z).toBeLessThan(0.5);
        expect(box.max.z).toBeGreaterThan(TREE_H - 1.5);
        expect(box.max.z).toBeLessThan(TREE_H + 1.5);
        expect(Math.max(box.max.x, box.max.y)).toBeLessThan(5.2);
      });
    }
  }

  it('keeps the high detail cheap enough for thousands of trees', () => {
    for (const shape of SHAPES) {
      const high = buildTree(shape, 'hoch').index!.count / 3;
      expect(high).toBeLessThan(2500);
      expect(buildTree(shape, 'niedrig').index!.count / 3).toBeLessThan(high);
    }
  });
});
