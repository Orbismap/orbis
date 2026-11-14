import { describe, expect, it } from 'vitest';
import { growScale, GROW_MS, MIN_SIZE_SCALE, SELECTED_SCALE, selectedSizeScale, sizeScale, stepGrow } from './size';

describe('sizeScale', () => {
  it('is full from zoom 9 up', () => {
    expect(sizeScale(9)).toBe(1);
    expect(sizeScale(14)).toBe(1);
  });
  it('falls gently below, by 2^0.6 per zoom step', () => {
    expect(sizeScale(8)).toBeCloseTo(2 ** -0.6);
    expect(sizeScale(7)).toBeCloseTo(2 ** -1.2);
    expect(sizeScale(8.5)).toBeGreaterThan(sizeScale(8));
  });
  it('keeps a floor', () => {
    expect(sizeScale(3)).toBe(MIN_SIZE_SCALE);
    expect(sizeScale(-2)).toBe(MIN_SIZE_SCALE);
  });
});

describe('growth of the selected aircraft', () => {
  it('moves up in 200 ms, down again, and clamps', () => {
    let p = 0;
    for (let i = 0; i < 4; i++) p = stepGrow(p, true, GROW_MS / 4);
    expect(p).toBeCloseTo(1);
    expect(stepGrow(1, true, 50)).toBe(1);
    expect(stepGrow(0.5, false, GROW_MS / 4)).toBeCloseTo(0.25);
    expect(stepGrow(0.1, false, GROW_MS)).toBe(0);
  });
  it('jumps with an infinite step (reduced motion)', () => {
    expect(stepGrow(0, true, Infinity)).toBe(1);
    expect(stepGrow(1, false, Infinity)).toBe(0);
  });
  it('is 1 at rest and the selected curve at the end, eased between', () => {
    expect(growScale(9, 0)).toBe(1);
    expect(growScale(9, 1)).toBeCloseTo(SELECTED_SCALE);
    expect(growScale(9, 0.5)).toBeCloseTo((1 + SELECTED_SCALE) / 2);
    expect(growScale(9, 0.1)).toBeLessThan(1 + (SELECTED_SCALE - 1) * 0.1);
  });
  it('keeps the selected aircraft large when zoomed out', () => {
    expect(selectedSizeScale(9)).toBe(1);
    expect(selectedSizeScale(3)).toBe(0.8);
    expect(selectedSizeScale(8)).toBeGreaterThan(0.9);
    // far out: about 0.8 * 1.5 = 1.2 of the full size against 0.35 for the others
    expect(sizeScale(3) * growScale(3, 1)).toBeCloseTo(0.8 * SELECTED_SCALE);
  });
});
