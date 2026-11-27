// What a replay sounds like at one instant: how loud each engine voice is, worked out from the modelled vehicles and the
// distance of the camera. Pure (no audio here); the WebAudio side lives in state/replay-sound.ts.
import { haversine } from '../core/geo';
import type { ReplayEvent, ShotView } from './types';

export interface SoundMix {
  /** deep rumble, 0..1 */
  rumble: number;
  /** the roar and crackle of the exhaust, 0..1 */
  roar: number;
  /** how rough the roar is (landing burns and the first seconds crackle most), 0..1 */
  crackle: number;
  /** low-pass cut-off of the roar in Hz: far away only the low part is left */
  roarHz: number;
  /** everything, 0..1 (silent when time runs fast or the camera is in space) */
  master: number;
}

export const SILENT: SoundMix = { rumble: 0, roar: 0, crackle: 0, roarHz: 400, master: 0 };

/** Air density relative to the sea level (scale height 8.5 km); nothing to carry sound above ~110 km. */
export function airFactor(altM: number): number {
  if (altM >= 110_000) return 0;
  return Math.exp(-Math.max(0, altM) / 8500) * Math.min(1, (110_000 - altM) / 30_000);
}

/** Loudness by distance: full inside 300 m, then falling with the distance (inverse law, never quite zero). */
export function distanceGain(distM: number): number {
  return 1 / (1 + Math.max(0, distM - 300) / 1500);
}

/** Replay speed -> how much of the sound is left: real time and up to 2x is heard, from 10x on it is just noise. */
export function speedGain(speed: number): number {
  if (speed <= 2) return 1;
  if (speed >= 10) return 0;
  return (10 - speed) / 8;
}

/**
 * The mix at `t` for a camera `view` (the shot the director or the viewer picked) at the replay `speed`.
 * Each vehicle adds its thrust (burning engines of its total), its distance to the listener and the air it burns in.
 */
export function mixAt(ev: ReplayEvent, t: number, view: ShotView | null, speed: number): SoundMix {
  if (!view) return SILENT;
  const listenerAlt = view.target[2];
  let rumble = 0;
  let roar = 0;
  let crackle = 0;
  let hz = 0;
  for (const a of ev.actors) {
    if (a.kind === 'satellite') continue;
    const s = a.at(t);
    if (!s || !s.burn) continue;
    let thrust = 1;
    if (s.engines && a.engines) {
      const total = a.engines.groups.reduce((n, g) => n + g.total, 0);
      const on = s.engines.reduce((n, e) => n + e, 0);
      thrust = total ? on / total : 1;
    }
    if (thrust <= 0) continue;
    // listener distance: the shot distance to its target, plus how far this vehicle is from that target
    const apart = Math.hypot(haversine([s.lng, s.lat], [view.target[0], view.target[1]]) * 1000, s.altM - listenerAlt);
    const d = view.distM + apart;
    const air = airFactor((s.altM + listenerAlt) / 2);
    const level = thrust * distanceGain(d) * air;
    rumble += level;
    roar += level * Math.min(1, 0.4 + thrust);
    // crackle: dense low air near the ground (landing burns, lift-off)
    crackle = Math.max(crackle, Math.min(1, Math.exp(-s.altM / 4000)) * distanceGain(d));
    hz = Math.max(hz, 700 + 5000 * distanceGain(d));
  }
  const soft = (x: number) => 1 - Math.exp(-x * 1.6);
  return {
    rumble: soft(rumble),
    roar: soft(roar),
    crackle,
    roarHz: hz || SILENT.roarHz,
    master: speedGain(speed),
  };
}
