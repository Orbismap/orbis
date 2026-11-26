import { describe, expect, it } from 'vitest';
import { windOf } from './wind';

describe('wind of a vector', () => {
  it('says where the wind comes from', () => {
    expect(windOf(0, -5).fromDeg).toBeCloseTo(0);
    expect(windOf(-5, 0).fromDeg).toBeCloseTo(90);
    expect(windOf(0, 5).fromDeg).toBeCloseTo(180);
    expect(windOf(5, 0).fromDeg).toBeCloseTo(270);
  });

  it('gives the speed', () => {
    expect(windOf(3, 4).speedMs).toBeCloseTo(5);
  });
});
