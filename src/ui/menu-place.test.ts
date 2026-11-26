import { describe, expect, it } from 'vitest';
import { placeMenu } from './menu-place';

const phone = { width: 375, height: 812 };

describe('placeMenu', () => {
  it('opens upwards from a button low on the screen, aligned to its left edge', () => {
    expect(placeMenu({ left: 12, right: 112, top: 700, bottom: 744 }, phone, 'start')).toEqual({ left: 12, width: 288, bottom: 118, room: 686 });
  });
  it('opens downwards from a button high on the screen, aligned to its right edge', () => {
    expect(placeMenu({ left: 319, right: 363, top: 60, bottom: 104 }, phone, 'end')).toEqual({ left: 75, width: 288, top: 110, room: 694 });
  });
  it('stays on the screen', () => {
    expect(placeMenu({ left: 340, right: 370, top: 100, bottom: 130 }, phone, 'start').left).toBe(79);
    expect(placeMenu({ left: 4, right: 40, top: 100, bottom: 130 }, phone, 'end').left).toBe(8);
    expect(placeMenu({ left: 4, right: 40, top: 100, bottom: 130 }, { width: 280, height: 600 }, 'start').width).toBe(264);
  });
});
