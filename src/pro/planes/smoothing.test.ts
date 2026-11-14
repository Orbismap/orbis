import { describe, expect, it } from 'vitest';
import type { TrackSample } from '../../ext/types';
import { GONE_MS, PlaneTracker, metres, modelOf, shortestDelta, targetOf } from './smoothing';

const sample = (over: Partial<TrackSample> = {}): TrackSample => ({
  id: 'abc123', lng: 10, lat: 50, altM: 10000, track: 90, speedMs: 230, vrMs: 0, ground: false, heli: false, category: 'A3',
  emergency: false, military: false, color: '#ffd84a', label: 'DLH1', t: 1_000_000, live: true, ...over,
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

describe('silent aircraft near the ground', () => {
  const low = { lon: 10, lat: 50, altM: 60, vsMs: -0.3, track: 70, speedMs: 66, ground: false, at: 0 };
  it('stops after 30 s instead of flying on', () => {
    expect(metres(10, 50, targetOf(low, 30_000).lon, targetOf(low, 30_000).lat)).toBeCloseTo(metres(10, 50, targetOf(low, 170_000).lon, targetOf(low, 170_000).lat), 0);
  });
  it('an aircraft at cruising height keeps flying', () => {
    const hi = { ...low, altM: 10000 };
    expect(metres(10, 50, targetOf(hi, 170_000).lon, targetOf(hi, 170_000).lat)).toBeGreaterThan(10_000);
  });
});

describe('snapshot -> live data', () => {
  it('snaps to the true place on the first live report, then eases again', () => {
    const t = new PlaneTracker();
    t.feed([sample({ live: false })], NOW, EPOCH); // overview snapshot
    const p = t.planes.get('abc123')!;
    for (let ms = 0; ms <= 10_000; ms += 50) t.step(NOW + ms);
    // the live view reports it 5 km north
    t.feed([sample({ lat: 50.045, lng: 10.0 + 0.0001, t: EPOCH + 10_000, live: true })], NOW + 10_000, EPOCH + 10_000);
    const want = targetOf(p, NOW + 10_000);
    expect(metres(want.lon, want.lat, p.dLon, p.dLat)).toBeLessThan(1);
    // the next live report eases as before
    t.feed([sample({ lat: 50.046, lng: 10.0 + 0.0001, t: EPOCH + 20_000, live: true })], NOW + 20_000, EPOCH + 20_000);
    const before = { lon: p.dLon, lat: p.dLat };
    expect(metres(before.lon, before.lat, targetOf(p, NOW + 20_000).lon, targetOf(p, NOW + 20_000).lat)).toBeGreaterThan(0);
  });
});

describe('trail from live data only', () => {
  it('snapshot reports add no trail points; the first live report starts the trail', () => {
    const t = new PlaneTracker();
    t.feed([sample({ live: false })], NOW, EPOCH);
    const p = t.planes.get('abc123')!;
    expect(p.trail).toHaveLength(0);
    t.feed([sample({ lat: 50.01, t: EPOCH + 90_000, live: false })], NOW + 90_000, EPOCH + 90_000);
    expect(p.trail).toHaveLength(0);
    t.feed([sample({ lat: 50.02, t: EPOCH + 100_000, live: true })], NOW + 100_000, EPOCH + 100_000);
    expect(p.trail).toHaveLength(1);
    expect(p.trail[0]![1]).toBeCloseTo(50.02, 5);
    t.feed([sample({ lat: 50.03, t: EPOCH + 110_000, live: true })], NOW + 110_000, EPOCH + 110_000);
    expect(p.trail).toHaveLength(2);
  });
  it('an aircraft first seen live starts with a trail point', () => {
    const t = new PlaneTracker();
    t.feed([sample()], NOW, EPOCH);
    expect(t.planes.get('abc123')!.trail).toHaveLength(1);
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
    expect(modelOf({ heli: false, category: 'B6' })).toBe('drone');
    expect(modelOf({ heli: false, category: 'C1' })).toBe('firetruck');
    expect(modelOf({ heli: false, category: 'C2', label: 'FOLLOW ME 1' })).toBe('car');
    expect(modelOf({ heli: false, category: 'C2', label: 'TUG12' })).toBe('tug');
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
