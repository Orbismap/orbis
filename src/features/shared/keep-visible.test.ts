import { describe, expect, it } from 'vitest';
import { hiddenBy } from './keep-visible';

describe('hiddenBy', () => {
  it('leaves a point above the sheet alone', () => {
    expect(hiddenBy(200, 800, 400)).toBe(0);
  });
  it('brings a point under the sheet to the middle of the free map', () => {
    expect(hiddenBy(600, 800, 400)).toBe(400);
  });
  it('also moves a point that touches the edge of the sheet', () => {
    expect(hiddenBy(390, 800, 400)).toBe(190);
  });
});
