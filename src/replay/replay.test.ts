import { describe, expect, it } from 'vitest';
import { haversine } from '../core/geo';
import { curve, lerpHeading, ramp } from './curve';
import { autoSpeed, phaseAt, scrubPos, scrubTime, separationM, shotAt, tLabel } from './director';
import { buildFlight, buildStarship15, PAD, returnMiss, T } from './events/starship15';
import { orbitPosition, orbitThrough, periodOf } from './orbit';

describe('curve', () => {
  it('passes through its keys and stays monotone between them', () => {
    const f = curve([[0, 0], [10, 1], [20, 1.2], [30, 5]]);
    expect(f(0)).toBe(0);
    expect(f(10)).toBeCloseTo(1);
    expect(f(30)).toBeCloseTo(5);
    let last = -1;
    for (let t = 0; t <= 30; t += 0.25) { expect(f(t)).toBeGreaterThanOrEqual(last - 1e-9); last = f(t); }
    expect(f(-5)).toBe(0);
    expect(f(99)).toBe(5);
  });
  it('ramps and blends headings the short way', () => {
    expect(ramp(5, 0, 10)).toBe(0.5);
    expect(ramp(-1, 0, 10)).toBe(0);
    expect(lerpHeading(350, 10, 0.5)).toBeCloseTo(0);
  });
});

describe('orbit', () => {
  it('passes through the point it was built for and returns after a period (shifted west by the Earth)', () => {
    const o = orbitThrough(-97, 26, 100, 275, 32);
    const [lng, lat] = orbitPosition(o, 100);
    expect(lng).toBeCloseTo(-97, 4);
    expect(lat).toBeCloseTo(26, 4);
    const P = periodOf(o.a);
    expect(P).toBeGreaterThan(5300);
    expect(P).toBeLessThan(5500);
    const [lng2, lat2] = orbitPosition(o, 100 + P);
    expect(lat2).toBeCloseTo(26, 0);
    // 5400 s of Earth rotation is about 22.5° (a little less: the node drifts west too)
    expect(lng - lng2).toBeGreaterThan(21);
    expect(lng - lng2).toBeLessThan(24);
  });
  it('never leaves ±inclination', () => {
    const o = orbitThrough(10, 20, 0, 275, 32);
    for (let t = 0; t < 20000; t += 60) expect(Math.abs(orbitPosition(o, t)[1])).toBeLessThanOrEqual(32.001);
  });
});

describe('Starship Flight 15', () => {
  const f = buildFlight();
  const ev = buildStarship15();
  const ship = (t: number) => f.ship(t);

  it('starts on the pad and the catch happens on it', () => {
    const s0 = ship(0);
    expect(haversine([s0.lng, s0.lat], PAD)).toBeLessThan(0.1);
    expect(s0.altM).toBeGreaterThan(30);
    const c = ship(T.catch);
    expect(haversine([c.lng, c.lat], PAD)).toBeLessThan(0.05);
    expect(c.altM).toBeLessThan(200);
    expect(c.speedMs).toBeLessThan(20);
  });

  it('the orbit brings the ship back over the pad region after ~22 h', () => {
    const m = returnMiss(f);
    expect(m.km).toBeGreaterThan(4500);
    expect(m.km).toBeLessThan(6500);
    expect(m.headingDeg).toBeLessThan(15);
  });

  it('is continuous: nothing teleports between seconds, heights stay sane', () => {
    // sampled where the speed changes fast too
    const ts = [...Array.from({ length: 700 }, (_, i) => i), ...Array.from({ length: 200 }, (_, i) => T.insert - 100 + i), ...Array.from({ length: 1500 }, (_, i) => T.entry - 100 + i)];
    for (const t of ts) {
      const a = ship(t);
      const b = ship(t + 1);
      const km = haversine([a.lng, a.lat], [b.lng, b.lat]);
      expect(km, `t=${t}`).toBeLessThan(9);
      expect(Math.abs(b.altM - a.altM), `alt t=${t}`).toBeLessThan(5000);
    }
  });

  it('crosses the phases in order: orbit height, speed and plasma', () => {
    const o = ship(T.insert + 3000);
    expect(o.altM).toBeGreaterThan(200_000);
    expect(o.altM).toBeLessThan(290_000);
    expect(o.speedMs).toBeGreaterThan(7500);
    expect(ship(T.entry - 1).altM).toBeLessThan(110_000);
    expect(ship(T.entry + 300).plasma).toBe(1);
    expect(ship(T.entry + 1000).plasma).toBe(0);
    const peak = ship(T.entry + 300);
    expect(peak.altM).toBeGreaterThan(60_000);
    expect(peak.speedMs).toBeGreaterThan(6000);
    expect(ship(T.landingBurn + 1).burn).toBe(true);
    expect(ship(T.deorbitStart + 5).burn).toBe(true);
    expect(ship(T.deorbitStart - 600).burn).toBe(false);
  });

  it('deorbit burn points against the flight direction', () => {
    const before = ship(T.deorbitStart - 60).heading;
    const during = ship(T.deorbitStart + 5).heading;
    const d = Math.abs((((during - before) % 360) + 540) % 360 - 180);
    expect(d).toBeGreaterThan(150);
  });

  it('the booster splashes down in the Gulf, east of the pad', () => {
    const b = f.booster(T.splash + 10);
    expect(b.altM).toBe(0);
    expect(b.lng).toBeGreaterThan(PAD[0]);
    expect(haversine([b.lng, b.lat], PAD)).toBeLessThan(40);
    expect(f.booster(100).burn).toBe(true);
    expect(f.booster(160).burn).toBe(true);
    expect(f.booster(300).burn).toBe(false);
  });

  it('engine displays: 33 on the booster, 6 on the ship, lit only while burning', () => {
    const e = (id: string, t: number) => ev.actors.find((a) => a.id === id)!.at(t)!.engines!;
    expect(e('booster', 50)).toEqual([3, 10, 20]);
    expect(e('booster', 115)[2]).toBeGreaterThan(0);
    expect(e('booster', 115)[2]).toBeLessThan(20);
    expect(e('booster', 130)).toEqual([3, 10, 0]);
    expect(e('booster', 145)).toEqual([0, 0, 0]);
    expect(e('booster', 160)).toEqual([3, 10, 0]);
    expect(e('booster', 300)).toEqual([0, 0, 0]);
    expect(e('ship', 30)).toEqual([0, 0]);
    expect(e('ship', 300)).toEqual([3, 3]);
    expect(e('ship', T.insert - 5)).toEqual([0, 3]);
    expect(e('ship', T.landingBurn + 2)).toEqual([3, 0]);
    // the flag the plume uses agrees with the engines, everywhere
    for (const t of [30, 130, 145, 160, 300, T.insert - 5, T.insert + 500, T.deorbitStart + 3, T.landingBurn + 2, T.catch]) {
      for (const a of ev.actors.filter((x) => x.engines)) {
        const s = a.at(t);
        if (s) expect(s.burn, `${a.id} t=${t}`).toBe(s.engines!.some((n) => n > 0));
      }
    }
  });

  it('the ship rides on top of the booster until staging', () => {
    expect(ship(10).altM).toBeGreaterThan(f.booster(10).altM + 40);
    expect(ship(T.sep + 1).altM).toBeGreaterThan(f.booster(T.sep + 1).altM);
  });

  it('26 Starlink satellites appear one by one and spread out', () => {
    const sats = ev.actors.filter((a) => a.kind === 'satellite');
    expect(sats).toHaveLength(26);
    expect(sats[0]!.at(T.deployStart - 1)).toBeNull();
    expect(sats[0]!.at(T.deployStart + 1)).not.toBeNull();
    expect(sats[25]!.at(T.deployEnd - 100)).toBeNull();
    const a = sats[0]!.at(T.deorbitStart - 100)!;
    const b = sats[25]!.at(T.deorbitStart - 100)!;
    expect(haversine([a.lng, a.lat], [b.lng, b.lat])).toBeGreaterThan(200);
  });

  it('phases are contiguous and cover the whole replay', () => {
    expect(ev.phases[0]!.from).toBe(ev.start);
    expect(ev.phases[ev.phases.length - 1]!.to).toBe(ev.end);
    for (let i = 1; i < ev.phases.length; i++) expect(ev.phases[i]!.from, ev.phases[i]!.id).toBeLessThanOrEqual(ev.phases[i - 1]!.to);
    expect(ev.markers.every((m) => m.t >= ev.start && m.t <= ev.end)).toBe(true);
  });
});

describe('director', () => {
  const ev = buildStarship15();

  it('picks the phase and the shot of a moment', () => {
    expect(phaseAt(ev, -30).id).toBe('countdown');
    expect(phaseAt(ev, 60).id).toBe('ascent');
    expect(phaseAt(ev, T.insert - 1000).id).toBe('coast');
    expect(phaseAt(ev, T.catch).id).toBe('catch');
    const shot = shotAt(ev, 60)!;
    expect(shot.phaseId).toBe('ascent');
    expect(shot.target[2]).toBeGreaterThan(5000);
    expect(shot.pitch).toBe(76);
    // behind the booster (bearingRel 135 of 180) means looking roughly along its heading
    const d = Math.abs((((shot.bearing - shot.heading) % 360) + 540) % 360 - 180);
    expect(d).toBeLessThan(60);
  });

  it('keeps both vehicles in frame when the shot asks for it', () => {
    const t = T.sep + 30;
    const a = ev.actors.find((x) => x.id === 'ship')!.at(t)!;
    const b = ev.actors.find((x) => x.id === 'booster')!.at(t)!;
    const shot = shotAt(ev, t)!;
    expect(shot.distM).toBeGreaterThanOrEqual(separationM(a, b) * 1.7 - 1);
  });

  it('a picked vehicle takes the camera, and falls back to the phase while it does not exist', () => {
    const t = 60;
    expect(shotAt(ev, t)!.phaseId).toBe('ascent');
    const picked = shotAt(ev, t, 'ship')!;
    expect(picked.phaseId).toBe('ascent|ship');
    const ship = ev.actors.find((a) => a.id === 'ship')!.at(t)!;
    expect(picked.target[2]).toBeCloseTo(ship.altM, 3);
    // satellite 1 is not there yet: the phase's own shot stays
    expect(shotAt(ev, t, 'sat1')!.phaseId).toBe('ascent');
    const later = shotAt(ev, T.deployEnd, 'sat1')!;
    expect(later.phaseId).toContain('|sat1');
    expect(later.distM).toBeGreaterThanOrEqual(1500);
  });

  it('has no shot while its target does not exist', () => {
    const odd = { ...ev, phases: [{ ...ev.phases[0]!, from: -100, to: 99999, shot: { ...ev.phases[0]!.shot, target: 'booster' } }] };
    expect(shotAt(odd, T.splash + 100)).toBeNull();
  });

  it('auto speed follows the phase, brakes before a slower one and never lurches', () => {
    // deep in the orbit phase: fast, but the burn is 100 s away at the end
    const orbit = ev.phases.find((p) => p.id === 'orbit')!;
    expect(autoSpeed(ev, orbit.from + 100, 3600, 0.016)).toBe(3600);
    const nearEnd = autoSpeed(ev, orbit.to - 30, 3600, 0.016);
    expect(nearEnd).toBeLessThan(100);
    expect(nearEnd).toBeGreaterThanOrEqual(1);
    // speeding up is limited per second
    expect(autoSpeed(ev, orbit.from + 100, 20, 0.016)).toBeLessThan(25);
    // approaching a boundary at the braked speed never carries the playhead past it in a frame
    let t = orbit.to - 2000;
    let v = 3600;
    for (let i = 0; i < 2000 && t < orbit.to; i++) { v = autoSpeed(ev, t, v, 1 / 60); t += v / 60; }
    expect(t).toBeLessThan(orbit.to + 30);
  });

  it('scrubber positions round-trip and give every phase equal width', () => {
    for (const t of [-50, 0, 100, 5000, 40_000, T.entry + 200, T.catch]) expect(scrubTime(ev, scrubPos(ev, t))).toBeCloseTo(t, 3);
    expect(scrubPos(ev, ev.phases[0]!.from)).toBe(0);
    expect(scrubPos(ev, ev.phases[1]!.from)).toBeCloseTo(1 / ev.phases.length);
  });

  it('formats T labels', () => {
    expect(tLabel(125)).toBe('T+02:05');
    expect(tLabel(-30)).toBe('T-00:30');
    expect(tLabel(21 * 3600 + 36 * 60 + 10)).toBe('T+21:36:10');
  });
});
