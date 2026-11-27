// The "director" of a replay: which phase is on, how the camera should sit for it, and how fast time should run. Pure.
import { haversine } from '../core/geo';
import type { ActorSample, Phase, ReplayEvent, Shot, ShotView } from './types';

/** The phase `t` falls in (the first one before the start, the last one after the end). */
export function phaseAt(ev: ReplayEvent, t: number): Phase {
  const list = ev.phases;
  for (const p of list) if (t >= p.from && t < p.to) return p;
  return t < list[0]!.from ? list[0]! : list[list.length - 1]!;
}

/** Camera orientation for a shot while its target has this heading: the map's bearing (where the camera looks) and pitch. */
export function shotView(shot: Shot, heading: number): { bearing: number; pitch: number; distM: number } {
  return { bearing: (((heading + shot.bearingRel + 180) % 360) + 360) % 360, pitch: shot.pitch, distM: shot.distM };
}

/** Straight-line distance between two samples in metres (good enough to size a two-actor shot). */
export function separationM(a: ActorSample, b: ActorSample): number {
  const ground = haversine([a.lng, a.lat], [b.lng, b.lat]) * 1000;
  return Math.hypot(ground, a.altM - b.altM);
}

/** Distance the camera needs to keep a target and a second actor in frame. */
export const framingDistance = (shotDistM: number, separation: number) => Math.max(shotDistM, separation * 1.7);

/** Fastest the replay speeds up per second of real time (factor), so a phase change never lurches. */
const ACCEL_PER_S = 3;

/**
 * Speed the "Auto" mode wants at `t`: the speed of the phase, but slowing down ahead of a slower phase so that the playhead
 * arrives at its start at about that phase's speed (it would otherwise skip right through short ones, like the 100 s de-orbit
 * burn after 21 h of time-lapse). `current` is the speed now; it may rise by at most a factor per second.
 */
export function autoSpeed(ev: ReplayEvent, t: number, current: number, dtReal: number): number {
  const i = ev.phases.indexOf(phaseAt(ev, t));
  const phase = ev.phases[i]!;
  let want = phase.speed;
  // look ahead over every later phase that is slower: the speed has to fall to theirs by the time we get there
  for (let k = i + 1; k < ev.phases.length; k++) {
    const next = ev.phases[k]!;
    if (next.speed >= want) continue;
    want = Math.min(want, Math.max(next.speed, (next.from - t) / 1.5));
  }
  const rise = Math.max(current, 1) * Math.exp(Math.log(ACCEL_PER_S) * dtReal);
  return Math.max(1, Math.min(want, rise));
}

/** "T+02:05", "T-00:30", "T+21:36:10" (hours only when there are some). */
export function tLabel(sec: number): string {
  const s = Math.round(Math.abs(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return `T${sec < 0 ? '-' : '+'}${h ? `${p(h)}:` : ''}${p(m)}:${p(s % 60)}`;
}

/** The camera shot at `t`: the phase's shot placed on the target's current position and heading. Null when its target does not exist (yet). */
export function shotAt(ev: ReplayEvent, t: number, focus: string | null = null): ShotView | null {
  const phase = phaseAt(ev, t);
  const actor = (id: string) => ev.actors.find((a) => a.id === id)?.at(t) ?? null;
  // a vehicle the viewer picked takes the camera, with the phase's distance and side (satellites are tiny: never closer than 1.5 km)
  const picked = focus ? ev.actors.find((a) => a.id === focus) : undefined;
  const pickedNow = picked ? picked.at(t) : null;
  const shot = pickedNow && picked ? { ...phase.shot, target: picked.id, also: undefined, distM: Math.max(phase.shot.distM, picked.kind === 'satellite' ? 1500 : 0) } : phase.shot;
  const main = shot.target === 'pad' ? null : pickedNow && picked && shot.target === picked.id ? pickedNow : actor(shot.target);
  if (shot.target !== 'pad' && !main) return null;
  const target: [number, number, number] = main ? [main.lng, main.lat, main.altM] : [ev.pad[0], ev.pad[1], 0];
  const heading = main?.heading ?? 0;
  const other = shot.also ? actor(shot.also) : null;
  const dist = main && other ? framingDistance(shot.distM, separationM(main, other)) : shot.distM;
  const view = shotView(shot, heading);
  return { phaseId: pickedNow ? `${phase.id}|${focus}` : phase.id, target, heading, bearing: view.bearing, pitch: view.pitch, distM: dist, globe: !!shot.globe };
}

/**
 * The scrubber position (0..1) of a time: every phase gets the same width, so the 21 quiet hours in orbit do not squeeze
 * the launch into a hair. Piecewise linear inside a phase.
 */
export function scrubPos(ev: ReplayEvent, t: number): number {
  const n = ev.phases.length;
  const i = Math.max(0, ev.phases.indexOf(phaseAt(ev, t)));
  const p = ev.phases[i]!;
  const within = p.to > p.from ? Math.min(1, Math.max(0, (t - p.from) / (p.to - p.from))) : 0;
  return (i + within) / n;
}

/** The time at a scrubber position (inverse of `scrubPos`). */
export function scrubTime(ev: ReplayEvent, x: number): number {
  const n = ev.phases.length;
  const c = Math.min(n - 1e-9, Math.max(0, x * n));
  const i = Math.floor(c);
  const p = ev.phases[i]!;
  return p.from + (p.to - p.from) * (c - i);
}
