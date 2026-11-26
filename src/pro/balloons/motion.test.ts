import { describe, expect, it } from 'vitest';
import type { BalloonSample } from '../../ext/types';
import { BalloonTracker, targetOf } from './motion';

const sample = (over: Partial<BalloonSample> = {}): BalloonSample => ({ id: 'a', lng: 10, lat: 50, altM: 10_000, speedMs: 20, course: 90, climbMs: 5, state: 'balloon', color: '#ffffff', t: 1_000_000, ...over });

describe('balloon motion', () => {
  it('drifts and climbs on from the last report', () => {
    const p = targetOf(sample(), 0, 60_000);
    expect(p.altM).toBeCloseTo(10_300);
    expect(p.lon).toBeGreaterThan(10);
    expect(p.lat).toBeCloseTo(50);
  });

  it('stops extrapolating after five minutes', () => {
    expect(targetOf(sample(), 0, 3_600_000).altM).toBeCloseTo(11_500);
  });

  it('stops a falling sonde at the ground, sideways too', () => {
    const falling = sample({ altM: 100, climbMs: -10, state: 'chute' });
    const at10 = targetOf(falling, 0, 10_000);
    expect(targetOf(falling, 0, 60_000)).toEqual(at10);
    expect(at10.altM).toBe(0);
  });

  it('leaves a landed one where it is', () => {
    expect(targetOf(sample({ state: 'landed', altM: 120 }), 0, 60_000)).toEqual({ lon: 10, lat: 50, altM: 120 });
  });

  it('keeps one state per sonde, eases to a new report and drops the missing ones', () => {
    const t = new BalloonTracker();
    t.feed([sample({ speedMs: 0, climbMs: 0 }), sample({ id: 'b' })], 1000, 1_000_000);
    t.step(1000);
    t.feed([sample({ speedMs: 0, climbMs: 0, altM: 11_000, t: 1_000_100 })], 1100, 1_000_100);
    expect([...t.balloons.keys()]).toEqual(['a']);
    t.step(1100);
    expect(t.balloons.get('a')!.offM).toBeGreaterThan(0);
    const alt = t.balloons.get('a')!.altM;
    expect(alt).toBeGreaterThan(10_000);
    expect(alt).toBeLessThan(11_000);
  });
});
