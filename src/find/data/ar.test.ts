import { describe, expect, it } from 'vitest';
import type { LngLat } from '@/core/geo';
import { focalLength, offsetTo, project, scene, turnsAhead, turnsOf, type SceneInput } from './ar';
import { cameraFromAngles } from './attitude';
import type { Place } from './kinds';

const place = (key: string, lng: number, lat: number): Place => ({ key, lng, lat, title: key, detail: '' });
// at 50° north: 0.001° of latitude ≈ 111 m, of longitude ≈ 71 m
const AT: LngLat = [8, 50];
const NORTH = cameraFromAngles(0, 90, 0);
const VIEW = { width: 400, height: 400, focal: 500 };

describe('projection', () => {
  it('puts what lies ahead in the middle, east to the right, higher things higher', () => {
    const [cx, cy] = project([0, 10, 0], NORTH, VIEW)!;
    expect(cx).toBeCloseTo(200);
    expect(cy).toBeCloseTo(200);
    const [x, y] = project([1, 10, 1], NORTH, VIEW)!;
    expect(x).toBeCloseTo(250);
    expect(y).toBeCloseTo(150);
    expect(project([0, -10, 0], NORTH, VIEW)).toBeNull();
  });

  it('measures east and north', () => {
    const [east, north] = offsetTo(AT, [8.001, 50], 0);
    expect(east).toBeCloseTo(71.5, 0);
    expect(north).toBeCloseTo(0, 0);
  });

  it('scales with the part of the picture that is cut off', () => {
    const upright = focalLength({ width: 360, height: 640 }, { width: 720, height: 1280 });
    expect(upright).toBeCloseTo(320 / Math.tan((32.5 * Math.PI) / 180), 6);
    // a wider view enlarges the picture to its width
    expect(focalLength({ width: 720, height: 640 }, { width: 720, height: 1280 })).toBeCloseTo(upright * 2, 6);
  });
});

describe('turns', () => {
  // 111 m north, then right (east), then straight on over a further junction
  const line: LngLat[] = [[8, 50], [8, 50.001], [8.001, 50.001], [8.002, 50.001]];
  const junctions: LngLat[] = [[8, 50.001], [8.001, 50.001]];

  it('finds only the junctions where the way turns and sets the arrow behind them', () => {
    const turns = turnsOf(line, junctions);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.angle).toBeCloseTo(90, 0);
    expect(turns[0]!.bearing).toBeCloseTo(90, 0);
    expect(turns[0]!.at[0]).toBeGreaterThan(8);
    expect(turns[0]!.at[1]).toBeCloseTo(50.001, 6);
    expect(offsetTo([8, 50.001], turns[0]!.at, 0)[0]).toBeCloseTo(9, 0);
  });

  it('drops a turn once it is passed', () => {
    expect(turnsAhead(line, junctions, AT)).toHaveLength(1);
    expect(turnsAhead(line, junctions, [8.00005, 50.001])).toHaveLength(1);
    expect(turnsAhead(line, junctions, [8.0005, 50.001])).toEqual([]);
  });

  it('has none without a way', () => {
    expect(turnsOf([], junctions)).toEqual([]);
    expect(turnsAhead([], junctions, AT)).toEqual([]);
  });
});

describe('scene', () => {
  const ahead = place('ahead', 8, 50.0009), behind = place('behind', 8, 49.999), far = place('far', 8, 50.01);
  const input: SceneInput = { at: AT, camera: NORTH, view: VIEW, places: [ahead, behind, far], target: ahead, line: [], junctions: [], there: false };

  it('marks what is in view and near enough', () => {
    const s = scene(input);
    expect(s.markers.map((m) => [m.place.key, m.target])).toEqual([['ahead', true]]);
    expect(s.markers[0]!.x).toBeCloseTo(200, 0);
    expect(s.aside).toBeNull();
  });

  it('keeps a far target and says on which side an unseen one lies', () => {
    expect(scene({ ...input, target: far }).markers.map((m) => m.place.key)).toContain('far');
    expect(scene({ ...input, camera: cameraFromAngles(90, 90, 0) })).toMatchObject({ markers: [], aside: 'right' });
    expect(scene({ ...input, camera: cameraFromAngles(270, 90, 0) }).aside).toBe('left');
  });

  it('hides a farther marker behind a nearer one', () => {
    const near = place('near', 8, 50.0005), close = place('close', 8, 50.00053);
    expect(scene({ ...input, places: [close, near], target: null }).markers.map((m) => m.place.key)).toEqual(['near']);
  });

  it('shows the others too, in a line of sight one above the other', () => {
    const others = [place('a', 8, 50.0004), place('b', 8, 50.0009), place('c', 8, 50.0018)];
    const s = scene({ ...input, places: others, target: others[0]! });
    expect(s.markers.map((m) => [m.place.key, m.target])).toEqual([['a', true], ['b', false], ['c', false]]);
    // farther ones higher up
    expect(s.markers[1]!.y).toBeLessThan(s.markers[0]!.y);
    expect(s.markers[2]!.y).toBeLessThan(s.markers[1]!.y);
  });

  it('keeps markers in view when the device tilts, and shows none looking at the ground', () => {
    const tilted = scene({ ...input, camera: cameraFromAngles(0, 50, 0) });
    expect(tilted.markers[0]!.y).toBeGreaterThan(30);
    expect(tilted.markers[0]!.y).toBeLessThan(VIEW.height / 2);
    expect(scene({ ...input, camera: cameraFromAngles(0, 10, 0) })).toMatchObject({ markers: [], arrows: [], down: true });
  });

  it('shows the arrow of the next turn, pointing to its side', () => {
    const line: LngLat[] = [AT, [8, 50.0005], [7.999, 50.0005]]; // north, then left
    const s = scene({ ...input, target: far, line, junctions: [[8, 50.0005]] });
    expect(s.arrows).toHaveLength(1);
    const xs = s.arrows[0]!.points.map((p) => p[0]);
    // the tip is the fourth corner
    expect(xs[3]).toBe(Math.min(...xs));
  });

  it('shows neither arrows nor the target once there', () => {
    expect(scene({ ...input, there: true })).toMatchObject({ markers: [], arrows: [], aside: null });
  });
});
