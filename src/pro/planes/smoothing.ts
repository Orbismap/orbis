// Aircraft state between reports. Positions arrive every ~10 s, so every aircraft keeps a small state that is
// dead-reckoned from its ground speed and track and eased towards each new report: no visible jumps. Pure
// (no three.js, no map), so it can be tested. Times are `performance.now()` milliseconds.
//
// Ported from the old app (planes3d.ts, PlaneTracker); new here: the fix time of a report (not its arrival) is the
// start of the extrapolation, reports repeating a known fix are ignored, and aircraft that vanish from the data
// are dropped after a short grace time.
import type { TrackSample } from '../../ext/types';

export type PlaneModel = 'light' | 'narrow' | 'wide' | 'heli';

export interface PlaneState {
  id: string;
  label: string;
  model: PlaneModel;
  emergency: boolean;
  military: boolean;
  ground: boolean;
  /** last report */
  lon: number;
  lat: number;
  altM: number;
  vsMs: number;
  track: number;
  speedMs: number;
  /** displayed (smoothed) state */
  dLon: number;
  dLat: number;
  dAlt: number;
  dTrack: number;
  /** time of the last fix (performance.now ms; derived from the report's own time) */
  at: number;
  /** epoch ms of the last fix, to recognise a repeated report */
  fixEpoch: number;
  /** when the aircraft was last in the data */
  seen: number;
  /** [lon, lat, altitude m, time (performance.now ms)] of the positions reported so far */
  trail: [number, number, number, number][];
}

/** an aircraft missing from the data this long is gone (landed, left the area, filtered out) */
export const GONE_MS = 25_000;
/** an extrapolation never runs longer than this (s) */
export const MAX_EXTRAPOLATE_S = 120;
export const TRAIL_MAX = 150;
const M_PER_DEG = 111320;
/** a position closer than this to the last trail point adds nothing (m); on the ground less */
const TRAIL_STEP_M = 30;
const TRAIL_STEP_GROUND_M = 5;

const rad = (d: number) => (d * Math.PI) / 180;
export const shortestDelta = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

/** Metres between two nearby points. */
export function metres(aLon: number, aLat: number, bLon: number, bLat: number): number {
  return Math.hypot((bLon - aLon) * Math.cos(rad(aLat)), bLat - aLat) * M_PER_DEG;
}

/** Which model an aircraft gets. */
export function modelOf(s: Pick<TrackSample, 'heli' | 'category'>): PlaneModel {
  if (s.heli) return 'heli';
  if (s.category === 'A5' || s.category === 'A6') return 'wide';
  if (s.category === 'A1' || s.category === 'A2' || s.category === 'B1' || s.category === 'B4') return 'light';
  return 'narrow';
}

/** Altitude of a trail point: aircraft on the ground are lifted a little to stay above the map. */
const trailAlt = (ground: boolean, altM: number) => (ground ? 0.3 : altM);

/** Where an aircraft is `now` according to its last report. */
export function targetOf(p: Pick<PlaneState, 'lon' | 'lat' | 'altM' | 'vsMs' | 'track' | 'speedMs' | 'ground' | 'at'>, now: number): { lon: number; lat: number; alt: number } {
  const elapsed = Math.max(0, Math.min(MAX_EXTRAPOLATE_S, (now - p.at) / 1000));
  const dist = p.speedMs * elapsed;
  const cosLat = Math.max(0.2, Math.cos(rad(p.lat)));
  return {
    lat: p.lat + (dist * Math.cos(rad(p.track))) / M_PER_DEG,
    lon: p.lon + (dist * Math.sin(rad(p.track))) / (M_PER_DEG * cosLat),
    // the altitude runs on with the climb / sink rate, for a minute at most: the aircraft levels off sometime
    alt: p.ground ? 0 : Math.max(0, p.altM + p.vsMs * Math.min(60, elapsed)),
  };
}

export class PlaneTracker {
  readonly planes = new Map<string, PlaneState>();
  private lastStep = 0;

  /**
   * A new list of reports (all aircraft currently in the data). `now`: performance.now ms, `epoch`: Date.now ms at the
   * same moment (a report's time `t` is epoch).
   */
  feed(samples: readonly TrackSample[], now: number, epoch: number): void {
    for (const s of samples) {
      const track = s.track ?? this.planes.get(s.id)?.track ?? 0;
      const age = Math.max(0, Math.min(MAX_EXTRAPOLATE_S * 1000, epoch - s.t));
      const at = now - age;
      const prev = this.planes.get(s.id);
      const common = { label: s.label, model: modelOf(s), emergency: s.emergency, military: s.military, ground: s.ground, lon: s.lng, lat: s.lat, altM: s.altM, vsMs: s.vrMs, track, speedMs: s.speedMs, at, fixEpoch: s.t, seen: now };
      if (!prev) {
        const state: PlaneState = { id: s.id, ...common, dLon: s.lng, dLat: s.lat, dAlt: s.altM, dTrack: track, trail: [[s.lng, s.lat, trailAlt(s.ground, s.altM), at]] };
        const t = targetOf(state, now);
        state.dLon = t.lon;
        state.dLat = t.lat;
        state.dAlt = t.alt;
        this.planes.set(s.id, state);
        continue;
      }
      prev.seen = now;
      if (prev.fixEpoch === s.t) continue; // the same fix again: nothing new
      const last = prev.trail[prev.trail.length - 1];
      // an aircraft that did not move since the last report adds no trail point
      if (!last || metres(last[0], last[1], s.lng, s.lat) >= (s.ground ? TRAIL_STEP_GROUND_M : TRAIL_STEP_M)) {
        prev.trail.push([s.lng, s.lat, trailAlt(s.ground, s.altM), at]);
        if (prev.trail.length > TRAIL_MAX) prev.trail.shift();
      }
      Object.assign(prev, common);
    }
    for (const [id, p] of this.planes) if (now - p.seen > GONE_MS) this.planes.delete(id);
  }

  /** Advance the displayed state to `now` (performance.now ms). */
  step(now: number): void {
    // after a longer pause (layer off, tab hidden) the aircraft jump to where they must be by now
    const snap = this.lastStep > 0 && now - this.lastStep > 2000;
    const dt = this.lastStep ? Math.min(0.25, (now - this.lastStep) / 1000) : 0;
    this.lastStep = now;
    const kPos = 1 - Math.exp(-dt / 1.0);
    const kAlt = 1 - Math.exp(-dt / 1.5);
    const kHdg = 1 - Math.exp(-dt / 0.7);
    for (const p of this.planes.values()) {
      const t = targetOf(p, now);
      const cosLat = Math.max(0.2, Math.cos(rad(p.lat)));
      // correction towards the target in metres (east, north); never backwards along the track: an aircraft running
      // ahead of the next report is not pulled back
      let dx = (t.lon - p.dLon) * cosLat * M_PER_DEG;
      let dy = (t.lat - p.dLat) * M_PER_DEG;
      const along = dx * Math.sin(rad(p.track)) + dy * Math.cos(rad(p.track));
      if (along < 0) {
        dx -= along * Math.sin(rad(p.track));
        dy -= along * Math.cos(rad(p.track));
      }
      if (snap) {
        p.dLon = t.lon;
        p.dLat = t.lat;
        p.dAlt = t.alt;
      } else {
        p.dLon += (dx * kPos) / (M_PER_DEG * cosLat);
        p.dLat += (dy * kPos) / M_PER_DEG;
        p.dAlt += (t.alt - p.dAlt) * kAlt;
      }
      p.dTrack = (p.dTrack + shortestDelta(p.dTrack, p.track) * kHdg + 360) % 360;
    }
  }

  clear(): void {
    this.planes.clear();
    this.lastStep = 0;
  }
}
