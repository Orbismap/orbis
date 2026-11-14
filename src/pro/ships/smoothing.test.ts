import { describe, expect, it } from 'vitest';
import type { ShipSample } from '../../ext/types';
import { metres } from '../planes/smoothing';
import { GONE_MS, MAX_EXTRAPOLATE_S, modelOf, ShipTracker, targetOf, TYPICAL_LEN_M } from './smoothing';

const sample = (over: Partial<ShipSample> = {}): ShipSample => ({
  id: '211000000', lng: 10, lat: 54, course: 90, heading: 90, speedMs: 10, moving: true, cls: 'cargo', color: '#4fc3f7', label: 'TESTSHIP', t: 1_000_000, ...over,
});
const NOW = 5000;
const EPOCH = 1_000_000; // a report made exactly now

describe('extrapolation', () => {
  it('sails east at its speed over ground', () => {
    const t = new ShipTracker();
    t.feed([sample()], NOW, EPOCH);
    const p = t.ships.get('211000000')!;
    for (let ms = 0; ms <= 30_000; ms += 50) t.step(NOW + ms);
    // 30 s at 10 m/s, eased: close to 300 m east on the same latitude
    expect(metres(10, 54, p.dLon, p.dLat)).toBeGreaterThan(230);
    expect(metres(10, 54, p.dLon, p.dLat)).toBeLessThan(320);
    expect(p.dLat).toBeCloseTo(54, 3);
  });

  it('does not move a ship at rest, whatever its stale speed says', () => {
    const t = new ShipTracker();
    t.feed([sample({ moving: false, speedMs: 3 })], NOW, EPOCH);
    const p = t.ships.get('211000000')!;
    for (let ms = 0; ms <= 20_000; ms += 50) t.step(NOW + ms);
    expect(p.dLon).toBeCloseTo(10, 9);
    expect(p.dLat).toBeCloseTo(54, 9);
  });

  it('starts from the fix time and stops after ten minutes', () => {
    const t = new ShipTracker();
    t.feed([sample({ t: EPOCH - 10_000 })], NOW, EPOCH);
    const p = t.ships.get('211000000')!;
    expect(metres(10, 54, p.dLon, p.dLat)).toBeGreaterThan(95);
    expect(metres(10, 54, p.dLon, p.dLat)).toBeLessThan(105);
    const far = targetOf(p, NOW + 3_600_000);
    expect(metres(10, 54, far.lon, far.lat)).toBeCloseTo(10 * MAX_EXTRAPOLATE_S, -1);
  });

  it('flies over the dead reckoning along the course', () => {
    const p = { lon: 10, lat: 54, moving: true, speedMs: 10, dir: 0, at: 0 };
    const t = targetOf(p, 100_000);
    expect(t.lon).toBeCloseTo(10, 9);
    expect(metres(10, 54, t.lon, t.lat)).toBeCloseTo(1000, 0);
  });
});

describe('easing to a new report', () => {
  it('does not jump to it', () => {
    const t = new ShipTracker();
    t.feed([sample()], NOW, EPOCH);
    const p = t.ships.get('211000000')!;
    for (let ms = 0; ms <= 10_000; ms += 50) t.step(NOW + ms);
    t.feed([sample({ lat: 54.01, lng: 10.001, t: EPOCH + 10_000 })], NOW + 10_000, EPOCH + 10_000);
    const before = { lon: p.dLon, lat: p.dLat };
    t.step(NOW + 10_050);
    expect(metres(before.lon, before.lat, p.dLon, p.dLat)).toBeLessThan(60);
    for (let ms = 100; ms <= 15_000; ms += 50) t.step(NOW + 10_000 + ms);
    // ... but it arrives: it is now close to the extrapolation of the new report
    const target = targetOf(p, NOW + 25_000);
    expect(metres(target.lon, target.lat, p.dLon, p.dLat)).toBeLessThan(15);
  });

  it('is never pulled back along its course', () => {
    const t = new ShipTracker();
    t.feed([sample()], NOW, EPOCH);
    const p = t.ships.get('211000000')!;
    for (let ms = 0; ms <= 10_000; ms += 50) t.step(NOW + ms);
    const lon = p.dLon;
    // the next report sits 500 m behind where the ship already is
    t.feed([sample({ lng: 10 - 0.0001, t: EPOCH + 1000 })], NOW + 10_000, EPOCH + 1000 + 9000);
    const x0 = p.dLon;
    t.step(NOW + 10_050);
    expect(p.dLon).toBeGreaterThanOrEqual(Math.min(x0, lon));
  });

  it('snaps after a long pause', () => {
    const t = new ShipTracker();
    t.feed([sample()], NOW, EPOCH);
    t.step(NOW);
    t.step(NOW + 100);
    t.step(NOW + 60_000);
    const p = t.ships.get('211000000')!;
    const target = targetOf(p, NOW + 60_000);
    expect(p.dLon).toBeCloseTo(target.lon, 9);
  });

  it('ignores a repeated fix but takes over a later name and length', () => {
    const t = new ShipTracker();
    t.feed([sample({ label: 'MMSI 211000000' })], NOW, EPOCH);
    t.feed([sample({ lng: 11, label: 'EVER GIVEN', lenM: 400 })], NOW + 1000, EPOCH + 1000);
    const p = t.ships.get('211000000')!;
    expect(p.lon).toBe(10);
    expect(p.label).toBe('EVER GIVEN');
    expect(p.lenM).toBe(400);
  });
});

describe('rotation', () => {
  it('eases towards the true heading by the short way round', () => {
    const t = new ShipTracker();
    t.feed([sample({ heading: 350, course: 10 })], NOW, EPOCH);
    const p = t.ships.get('211000000')!;
    expect(p.dRot).toBe(350);
    t.feed([sample({ heading: 20, t: EPOCH + 1000 })], NOW + 1000, EPOCH + 1000);
    t.step(NOW + 1000);
    t.step(NOW + 1200);
    expect(p.dRot > 350 || p.dRot < 20).toBe(true);
    for (let ms = 0; ms < 10_000; ms += 50) t.step(NOW + 1200 + ms);
    expect(p.dRot).toBeCloseTo(20, 0);
  });

  it('prefers the heading, else the course, and keeps its rotation at rest', () => {
    const t = new ShipTracker();
    t.feed([sample({ heading: undefined, course: 45 })], NOW, EPOCH);
    expect(t.ships.get('211000000')!.rot).toBe(45);
    t.feed([sample({ heading: undefined, course: 300, moving: false, speedMs: 0, t: EPOCH + 1000 })], NOW + 1000, EPOCH + 1000);
    expect(t.ships.get('211000000')!.rot).toBe(45);
    t.feed([sample({ heading: 120, course: 300, moving: false, speedMs: 0, t: EPOCH + 2000 })], NOW + 2000, EPOCH + 2000);
    expect(t.ships.get('211000000')!.rot).toBe(120);
  });
});

describe('who is there', () => {
  it('drops a ship after the grace time and clears everything', () => {
    const t = new ShipTracker();
    t.feed([sample(), sample({ id: 'b' })], NOW, EPOCH);
    t.feed([sample({ id: 'b', t: EPOCH + 1000 })], NOW + GONE_MS - 1, EPOCH + 1000);
    expect([...t.ships.keys()].sort()).toEqual(['211000000', 'b']);
    t.feed([sample({ id: 'b', t: EPOCH + 2000 })], NOW + GONE_MS + 1, EPOCH + 2000);
    expect([...t.ships.keys()]).toEqual(['b']);
    t.clear();
    expect(t.ships.size).toBe(0);
  });

  it('maps the class to a model and a typical length', () => {
    expect(modelOf('cargo')).toBe('cargo');
    expect(modelOf('special')).toBe('tug');
    expect(modelOf('other')).toBe('other');
    expect(modelOf('whatever')).toBe('other');
    const t = new ShipTracker();
    t.feed([sample({ cls: 'pleasure', color: '#e8d44d' })], NOW, EPOCH);
    const p = t.ships.get('211000000')!;
    expect(p.model).toBe('pleasure');
    expect(p.color).toBe(0xe8d44d);
    expect(p.lenM).toBe(TYPICAL_LEN_M.pleasure);
  });
});
