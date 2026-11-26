// Balloon state between reports (pure). A radiosonde reports now, the data comes every few minutes: each one is
// dead-reckoned from its drift and climb rate and eased towards the next report. Times: `performance.now()` milliseconds.
import type { BalloonSample } from '../../ext/types';
import { shortestDelta } from '../planes/smoothing';

/** an extrapolation never runs longer than this (s); the same as the 2D layer's `maxExtrapolateMs` */
export const MAX_EXTRAPOLATE_S = 300;
const M_PER_DEG = 111320;
/** time constant of the move towards a new report (s) */
const EASE_S = 1.5;
/** a longer pause between two steps: the balloons jump to where they must be by now (ms) */
const SNAP_MS = 2000;

export interface BalloonState {
  sample: BalloonSample;
  /** time of the fix (performance.now ms) */
  at: number;
  /** displayed (smoothed) state */
  lon: number;
  lat: number;
  altM: number;
  /** how far the displayed place still is from where it should be (m) */
  offM: number;
}

/** Where a balloon is `now` according to its last report. A falling one stops when it reaches the sea level. */
export function targetOf(s: BalloonSample, at: number, now: number): { lon: number; lat: number; altM: number } {
  if (s.state === 'landed') return { lon: s.lng, lat: s.lat, altM: s.altM };
  let t = Math.max(0, Math.min(MAX_EXTRAPOLATE_S, (now - at) / 1000));
  if (s.climbMs < 0) t = Math.min(t, Math.max(0, s.altM) / -s.climbMs);
  const dist = s.course === undefined ? 0 : s.speedMs * t;
  const rad = ((s.course ?? 0) * Math.PI) / 180;
  const cosLat = Math.max(0.2, Math.cos((s.lat * Math.PI) / 180));
  return {
    lon: s.lng + (dist * Math.sin(rad)) / (M_PER_DEG * cosLat),
    lat: s.lat + (dist * Math.cos(rad)) / M_PER_DEG,
    altM: Math.max(0, s.altM + s.climbMs * t),
  };
}

export class BalloonTracker {
  readonly balloons = new Map<string, BalloonState>();
  private lastStep = 0;

  /** The whole current list. `now`: performance.now ms, `epoch`: Date.now ms at the same moment. */
  feed(samples: readonly BalloonSample[], now: number, epoch: number): void {
    const ids = new Set(samples.map((s) => s.id));
    for (const id of this.balloons.keys()) if (!ids.has(id)) this.balloons.delete(id);
    for (const sample of samples) {
      const prev = this.balloons.get(sample.id);
      if (prev && sample.t < prev.sample.t) continue;
      const at = now - Math.max(0, Math.min(MAX_EXTRAPOLATE_S * 1000, epoch - sample.t));
      if (prev) Object.assign(prev, { sample, at });
      else {
        const p = targetOf(sample, at, now);
        this.balloons.set(sample.id, { sample, at, ...p, offM: 0 });
      }
    }
  }

  step(now: number): void {
    const snap = this.lastStep > 0 && now - this.lastStep > SNAP_MS;
    const dt = this.lastStep ? Math.min(0.25, (now - this.lastStep) / 1000) : 0;
    this.lastStep = now;
    const k = snap ? 1 : 1 - Math.exp(-dt / EASE_S);
    for (const b of this.balloons.values()) {
      const t = targetOf(b.sample, b.at, now);
      const [dLon, dLat, dAlt] = [shortestDelta(b.lon, t.lon), t.lat - b.lat, t.altM - b.altM];
      b.lon += dLon * k;
      b.lat += dLat * k;
      b.altM += dAlt * k;
      b.offM = (1 - k) * Math.hypot(dLon * M_PER_DEG * Math.cos((b.lat * Math.PI) / 180), dLat * M_PER_DEG, dAlt);
    }
  }

  clear(): void {
    this.balloons.clear();
    this.lastStep = 0;
  }
}
