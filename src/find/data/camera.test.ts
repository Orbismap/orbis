import { describe, expect, it } from 'vitest';
import { approach, bearingFor, type View } from './camera';

const way = { bearing: 90, distance: 200 };

describe('what is up', () => {
  it('is where the person looks, with a compass', () => {
    expect(bearingFor({ compass: true, heading: 10, way, previous: 0 })).toBe(10);
  });
  it('is where the route leads without one, also over the way travelled', () => {
    expect(bearingFor({ compass: false, heading: 10, way, previous: 0 })).toBe(90);
  });
  it('stays at the end of the way', () => {
    expect(bearingFor({ compass: false, heading: null, way: { bearing: 270, distance: 3 }, previous: 90 })).toBe(90);
  });
  it('is the way travelled without a target, else unchanged', () => {
    expect(bearingFor({ compass: false, heading: 10, way: null, previous: 45 })).toBe(10);
    expect(bearingFor({ compass: false, heading: null, way: null, previous: 45 })).toBe(45);
  });
});

describe('the camera', () => {
  const view: View = { center: [11.4, 53.6], zoom: 18, pitch: 60, bearing: 350 };
  it('turns the short way round', () => {
    const { view: next } = approach(view, { ...view, bearing: 10 }, 16);
    expect(next.bearing).toBeGreaterThan(350);
    expect(next.bearing).toBeLessThan(370);
  });
  it('arrives', () => {
    const goal: View = { center: [11.401, 53.601], zoom: 18, pitch: 60, bearing: 90 };
    let current = view, done = false;
    for (let i = 0; i < 200 && !done; i++) ({ view: current, done } = approach(current, goal, 16));
    expect(done).toBe(true);
    expect(current.center).toEqual(goal.center);
    expect(((current.bearing % 360) + 360) % 360).toBe(90);
  });
});
