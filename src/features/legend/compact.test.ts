import { describe, expect, it } from 'vitest';
import { pickTicks } from './compact';

describe('pickTicks', () => {
  it('keeps short lists', () => {
    expect(pickTicks([0, 10])).toEqual([0, 10]);
    expect(pickTicks([0, 5, 10, 20])).toEqual([0, 5, 10, 20]);
  });
  it('reduces long lists to min, two inner values, max', () => {
    expect(pickTicks([0, 1, 2, 3, 4, 5, 6])).toEqual([0, 2, 4, 6]);
    expect(pickTicks([-20, -10, 0, 10, 20])).toEqual([-20, -10, 10, 20]);
  });
});
