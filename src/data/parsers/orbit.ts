// Satellite propagation helpers. satellite.js is passed in (loaded with a dynamic import by the layer), so that this
// file stays free of the library at module level.
import type { SatRec } from 'satellite.js';
import type { TleRec } from './tle';

export type SatLib = typeof import('satellite.js');
export type Sat = { rec: TleRec; sr: SatRec };
export type SatPos = { lng: number; lat: number; /** km above the ellipsoid */ alt: number; /** km/s, inertial */ v: number };

export function initSats(lib: SatLib, recs: TleRec[]): Sat[] {
  const out: Sat[] = [];
  for (const rec of recs) {
    try {
      const sr = lib.twoline2satrec(rec.l1, rec.l2);
      if (sr.error) continue;
      out.push({ rec, sr });
    } catch {
      /* malformed element set */
    }
  }
  return out;
}

/** Geodetic position of `s` at `date`; `gmst` may be passed to share it between many satellites. */
export function positionAt(lib: SatLib, s: Sat, date: Date, gmst = lib.gstime(date)): SatPos | undefined {
  const pv = lib.propagate(s.sr, date);
  if (!pv || !pv.position || typeof pv.position === 'boolean') return undefined;
  const gd = lib.eciToGeodetic(pv.position, gmst);
  const v = pv.velocity && typeof pv.velocity !== 'boolean' ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : 0;
  const lat = lib.degreesLat(gd.latitude);
  const lng = lib.degreesLong(gd.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lng, lat, alt: gd.height, v };
}

/**
 * Track over the ground from `t0 - span` to `t0 + span` (ms), as line segments split at the antimeridian.
 * `n` samples per side.
 */
export function groundTrack(lib: SatLib, s: Sat, t0: number, spanMs: number, n = 90): [number, number][][] {
  const lines: [number, number][][] = [];
  let cur: [number, number][] = [];
  let prevLng: number | undefined;
  for (let i = -n; i <= n; i++) {
    const t = t0 + (i / n) * spanMs;
    const p = positionAt(lib, s, new Date(t));
    if (!p) continue;
    if (prevLng !== undefined && Math.abs(p.lng - prevLng) > 180) {
      // crossing the antimeridian: close the segment at ±180 and start a new one
      const edge = prevLng > 0 ? 180 : -180;
      const last = cur[cur.length - 1]!;
      const f = (edge - last[0]) / (p.lng + (prevLng > 0 ? 360 : -360) - last[0]);
      const latCross = last[1] + (p.lat - last[1]) * f;
      cur.push([edge, latCross]);
      lines.push(cur);
      cur = [[-edge, latCross]];
    }
    cur.push([p.lng, p.lat]);
    prevLng = p.lng;
  }
  if (cur.length > 1) lines.push(cur);
  return lines;
}

/** Ground speed (m/s) and heading (deg) from two positions `dtSec` apart. */
export function groundMotion(a: { lng: number; lat: number }, b: { lng: number; lat: number }, dtSec: number): { speed: number; heading: number } {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  let dLng = b.lng - a.lng;
  if (dLng > 180) dLng -= 360;
  if (dLng < -180) dLng += 360;
  dLng *= rad;
  const x = dLng * Math.cos(((a.lat + b.lat) / 2) * rad) * R;
  const y = dLat * R;
  return { speed: Math.hypot(x, y) / dtSec, heading: ((Math.atan2(x, y) / rad) + 360) % 360 };
}
