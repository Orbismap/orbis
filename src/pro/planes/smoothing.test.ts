import { describe, expect, it } from 'vitest';
import type { TrackSample } from '../../ext/types';
import { GONE_MS, PlaneTracker, metres, modelOf, shortestDelta, targetOf } from './smoothing';

const sample = (over: Partial<TrackSample> = {}): TrackSample => ({
  id: 'abc123', lng: 10, lat: 50, altM: 10000, track: 90, speedMs: 230, vrMs: 0, ground: false, heli: false, category: 'A3',
  emergency: false, military: false, color: '#ffd84a', label: 'DLH1', t: 1_000_000, ...over,
});
const NOW = 5000;
const EPOCH = 1_000_000; // a report made exactly now

describe('extrapolation', () => {
  it('flies east at its ground speed', () => {
    const t = new PlaneTracker();
    t.feed([sample()], NOW, EPOCH);
    const p = t.planes.get('abc123')!;
    t.step(NOW);
    for (let ms = 0; ms < 10_000; ms += 50) t.step(NOW + ms);
    // 10 s at 230 m/s, eased: close to 2.3 km east, on the same latitude
    expect(metres(10, 50, p.dLon, p.dLat)).toBeGreaterThan(1800);
    expect(metres(10, 50, p.dLon, p.dLat)).toBeLessThan(2400);
    expect(p.dLon).toBeGreaterThan(10);
    expect(p.dLat).toBeCloseTo(50, 3);
  });

  it('starts a report from its fix time, not its arrival', () => {
    const t = new PlaneTracker();
    // the fix is 10 s old when it arrives: the aircraft appears 2.3 km further on
    t.feed([sample({ t: EPOCH - 10_000 })], NOW, EPOCH);
    const p = t.planes.get('abc123')!;
    expect(metres(10, 50, p.dLon, p.dLat)).toBeGreaterThan(2200);
    expect(targetOf(p, NOW).lon).toBeCloseTo(p.dLon, 6);
  });

  it('climbs with its vertical rate, for a minute at most', () => {
    const p = { lon: 10, lat: 50, altM: 1000, vsMs: 10, track: 0, speedMs: 0, ground: false, at: 0 };
    expect(targetOf(p, 30_000).alt).toBeCloseTo(1300);
    expect(targetOf(p, 300_000).alt).toBeCloseTo(1600);
    expect(targetOf({ ...p, ground: true }, 30_000).alt).toBe(0);
  });
});

describe('easing to a new report', () => {
  it('does not jump: the displayed position moves a fraction towards the new one', () => {
    const t = new PlaneTracker();
    t.feed([sample()], NOW, EPOCH);
    const p = t.planes.get('abc123')!;
    for (let ms = 0; ms <= 10_000; ms += 50) t.step(NOW + ms);
    // the next report puts it 1 km north of the extrapolated path
    t.feed([sample({ lat: 50.01, lng: 10.0 + 0.0001, t: EPOCH + 10_000 })], NOW + 10_000, EPOCH + 10_000);
    const before = { lon: p.dLon, lat: p.dLat };
    t.step(NOW + 10_050);
    // one 50 ms step: the flight itself (~12 m) plus about 5 % of the 1.1 km offset, nowhere near the whole of it
    expect(metres(before.lon, before.lat, p.dLon, p.dLat)).toBeLessThan(80);
  });

  it('is never pulled back along its track', () => {
    const t = new PlaneTracker();
    t.feed([sample()], NOW, EPOCH);
    const p = t.planes.get('abc123')!;
    for (let ms = 0; ms <= 20_000; ms += 50) t.step(NOW + ms);
    const ahead = p.dLon;
    // a report that lies behind where the displayed aircraft already is (same fix repeated at an older place)
    t.feed([sample({ lng: 10.001, t: EPOCH + 1 })], NOW + 20_000, EPOCH + 20_000);
    let last = ahead;
    for (let ms = 20_000; ms <= 22_000; ms += 50) {
      t.step(NOW + ms);
      expect(p.dLon).toBeGreaterThanOrEqual(last - 1e-12);
      last = p.dLon;
    }
  });

  it('turns the short way round', () => {
    expect(shortestDelta(350, 10)).toBe(20);
    expect(shortestDelta(10, 350)).toBe(-20);
    const t = new PlaneTracker();
    t.feed([sample({ track: 350 })], NOW, EPOCH);
    t.feed([sample({ track: 10, t: EPOCH + 10_000 })], NOW + 10_000, EPOCH + 10_000);
    const p = t.planes.get('abc123')!;
    t.step(NOW + 10_000);
    t.step(NOW + 10_200);
    // from 350 towards 10 across north: ends up between 350 and 360 or above 0, never near 180
    expect(p.dTrack > 350 || p.dTrack < 20).toBe(true);
  });

  it('snaps to the extrapolated place after a long pause', () => {
    const t = new PlaneTracker();
    t.feed([sample()], NOW, EPOCH);
    t.step(NOW);
    t.step(NOW + 60_000);
    const p = t.planes.get('abc123')!;
    expect(metres(10, 50, p.dLon, p.dLat)).toBeGreaterThan(13_000);
  });
});

describe('reports', () => {
  it('a repeated fix adds nothing', () => {
    const t = new PlaneTracker();
    t.feed([sample()], NOW, EPOCH);
    t.feed([sample()], NOW + 10_000, EPOCH + 10_000);
    expect(t.planes.get('abc123')!.trail).toHaveLength(1);
  });

  it('adds a trail point only when the aircraft moved', () => {
    const t = new PlaneTracker();
    t.feed([sample()], NOW, EPOCH);
    t.feed([sample({ lng: 10.00001, t: EPOCH + 1 })], NOW + 1, EPOCH + 1);
    expect(t.planes.get('abc123')!.trail).toHaveLength(1);
    t.feed([sample({ lng: 10.01, t: EPOCH + 10_000 })], NOW + 10_000, EPOCH + 10_000);
    expect(t.planes.get('abc123')!.trail).toHaveLength(2);
  });

  it('drops an aircraft that is missing from the data for a while', () => {
    const t = new PlaneTracker();
    t.feed([sample()], NOW, EPOCH);
    t.feed([], NOW + GONE_MS - 1, EPOCH);
    expect(t.planes.size).toBe(1);
    t.feed([], NOW + GONE_MS + 1, EPOCH);
    expect(t.planes.size).toBe(0);
  });

  it('picks a model from the category', () => {
    expect(modelOf({ heli: true, category: 'A7' })).toBe('heli');
    expect(modelOf({ heli: false, category: 'A5' })).toBe('wide');
    expect(modelOf({ heli: false, category: 'A1' })).toBe('light');
    expect(modelOf({ heli: false, category: '' })).toBe('narrow');
  });
});

describe('older reports', () => {
  it('are ignored (the overview after the detailed view)', () => {
    const t = new PlaneTracker();
    t.feed([sample({ lng: 10.5 })], NOW, EPOCH);
    t.feed([sample({ lng: 10, t: EPOCH - 60_000 })], NOW + 1000, EPOCH + 1000);
    expect(t.planes.get('abc123')!.lon).toBe(10.5);
    expect(t.planes.get('abc123')!.trail).toHaveLength(1);
  });
});
