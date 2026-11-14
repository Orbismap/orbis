// Ship state between reports. A ship under way reports every few seconds, one at anchor every few minutes, and the
// layer republishes the whole list about once a second. Every ship keeps a small state that is dead-reckoned from its
// speed and course (only while it moves) and eased towards each new report: no visible jumps. Pure (no three.js, no
// map), so it can be tested. Times are `performance.now()` milliseconds. Same scheme as the aircraft's PlaneTracker.
import type { ShipSample } from '../../ext/types';
import { shortestDelta } from '../planes/smoothing';

export type ShipModel = 'cargo' | 'tanker' | 'passenger' | 'fishing' | 'tug' | 'pleasure' | 'other';

export interface ShipState {
  id: string;
  label: string;
  model: ShipModel;
  /** colour of the model (0xrrggbb), as the base colours its 2D icon (class colour, same as the legend) */
  color: number;
  /** length in metres: the reported one, else a typical one of the model */
  lenM: number;
  /** last report */
  lon: number;
  lat: number;
  moving: boolean;
  speedMs: number;
  /** direction of travel (degrees), the one the dead reckoning runs along */
  dir: number;
  /** where the bow points (degrees), the displayed rotation eases towards it */
  rot: number;
  /** displayed (smoothed) state */
  dLon: number;
  dLat: number;
  dRot: number;
  /** time of the last fix (performance.now ms; derived from the report's own time) */
  at: number;
  /** epoch ms of the last fix, to recognise a repeated report */
  fixEpoch: number;
  /** when the ship was last in the data */
  seen: number;
}

/**
 * A ship missing from the data this long is gone (left the view, filtered out, lost reception). Short: the list is
 * republished every second, only the single ship reports rarely, and the layer keeps all ships it knows in it.
 */
export const GONE_MS = 90_000;
/** an extrapolation never runs longer than this (s); the same as the 2D layer's `maxExtrapolateMs` */
export const MAX_EXTRAPOLATE_S = 600;
const M_PER_DEG = 111320;
/** a longer pause between two steps (layer off, tab hidden): the ships jump to where they must be by now (ms) */
const SNAP_MS = 2000;

const rad = (d: number) => (d * Math.PI) / 180;

/** Which model a ship class gets. */
export function modelOf(cls: string): ShipModel {
  switch (cls) {
    case 'cargo': case 'tanker': case 'passenger': case 'fishing': case 'pleasure': return cls;
    case 'special': return 'tug';
    default: return 'other';
  }
}

/** A typical length (m) per model, used while a ship's own length is not known (the length each model is built at, see models.ts). */
export const TYPICAL_LEN_M: Record<ShipModel, number> = { cargo: 180, tanker: 220, passenger: 150, fishing: 30, tug: 28, pleasure: 12, other: 60 };

/** Where a ship is `now` according to its last report: on along its direction while it moves, else where it was reported. */
export function targetOf(p: Pick<ShipState, 'lon' | 'lat' | 'moving' | 'speedMs' | 'dir' | 'at'>, now: number): { lon: number; lat: number } {
  if (!p.moving || p.speedMs <= 0) return { lon: p.lon, lat: p.lat };
  const elapsed = Math.max(0, Math.min(MAX_EXTRAPOLATE_S, (now - p.at) / 1000));
  const dist = p.speedMs * elapsed;
  const cosLat = Math.max(0.2, Math.cos(rad(p.lat)));
  return {
    lat: p.lat + (dist * Math.cos(rad(p.dir))) / M_PER_DEG,
    lon: p.lon + (dist * Math.sin(rad(p.dir))) / (M_PER_DEG * cosLat),
  };
}

export class ShipTracker {
  readonly ships = new Map<string, ShipState>();
  private lastStep = 0;

  /**
   * A new list of reports (all ships currently in the data). `now`: performance.now ms, `epoch`: Date.now ms at the
   * same moment (a report's time `t` is epoch).
   */
  feed(samples: readonly ShipSample[], now: number, epoch: number): void {
    for (const s of samples) {
      const prev = this.ships.get(s.id);
      const model = modelOf(s.cls);
      // identity: may arrive later than the first position (static AIS data), so it is always taken over
      const identity = { label: s.label, model, color: Number.parseInt(s.color.slice(1), 16) || 0xffffff, lenM: s.lenM && s.lenM > 0 ? s.lenM : TYPICAL_LEN_M[model] };
      if (prev) {
        prev.seen = now;
        Object.assign(prev, identity);
        // the same fix again, or an older one (the two sources of the layer): nothing new
        if (s.t <= prev.fixEpoch) continue;
      }
      const age = Math.max(0, Math.min(MAX_EXTRAPOLATE_S * 1000, epoch - s.t));
      const at = now - age;
      // under way the bow follows the true heading, else the course; at rest only a true heading counts (the course of
      // a ship at anchor is noise) and without one the ship keeps the rotation it had
      const rot = s.heading ?? (s.moving ? s.course : undefined) ?? prev?.rot ?? 0;
      const dir = s.course ?? s.heading ?? prev?.dir ?? rot;
      const kin = { lon: s.lng, lat: s.lat, moving: s.moving && s.speedMs > 0, speedMs: s.speedMs, dir, rot, at, fixEpoch: s.t, seen: now };
      if (prev) {
        Object.assign(prev, kin);
        continue;
      }
      const state: ShipState = { id: s.id, ...identity, ...kin, dLon: s.lng, dLat: s.lat, dRot: rot };
      const t = targetOf(state, now);
      state.dLon = t.lon;
      state.dLat = t.lat;
      this.ships.set(s.id, state);
    }
    for (const [id, p] of this.ships) if (now - p.seen > GONE_MS) this.ships.delete(id);
  }

  /** Advance the displayed state to `now` (performance.now ms). */
  step(now: number): void {
    const snap = this.lastStep > 0 && now - this.lastStep > SNAP_MS;
    const dt = this.lastStep ? Math.min(0.25, (now - this.lastStep) / 1000) : 0;
    this.lastStep = now;
    const kPos = 1 - Math.exp(-dt / 1.5);
    const kRot = 1 - Math.exp(-dt / 1.0);
    for (const p of this.ships.values()) {
      const t = targetOf(p, now);
      if (snap) {
        p.dLon = t.lon;
        p.dLat = t.lat;
        p.dRot = p.rot;
        continue;
      }
      const cosLat = Math.max(0.2, Math.cos(rad(p.lat)));
      // correction towards the target in metres (east, north); never backwards along the course: a ship running ahead
      // of the next report is not pulled back
      let dx = (t.lon - p.dLon) * cosLat * M_PER_DEG;
      let dy = (t.lat - p.dLat) * M_PER_DEG;
      if (p.moving) {
        const along = dx * Math.sin(rad(p.dir)) + dy * Math.cos(rad(p.dir));
        if (along < 0) {
          dx -= along * Math.sin(rad(p.dir));
          dy -= along * Math.cos(rad(p.dir));
        }
      }
      p.dLon += (dx * kPos) / (M_PER_DEG * cosLat);
      p.dLat += (dy * kPos) / M_PER_DEG;
      p.dRot = (p.dRot + shortestDelta(p.dRot, p.rot) * kRot + 360) % 360;
    }
  }

  clear(): void {
    this.ships.clear();
    this.lastStep = 0;
  }
}
