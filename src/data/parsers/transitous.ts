// Transitous (MOTIS, community run, CORS "*"): `/api/v5/map/trips` returns the stop-to-stop trip segments running in a
// box and a time window, with real-time times. Current positions are interpolated along the segment polyline, exactly
// like transitous.org does. The parser decodes the polylines (in the worker); `segmentFixes` places the vehicles.
import { fetchRaw } from '../http';
import { runParser } from '../worker/pool';
import type { BBox } from '../../core/geo';
import { decodePolyline } from '../../core/polyline';
import { kindOfMode, transitousFeedOf, type VehicleFix } from './vehicles';

export { decodePolyline };

export interface Segment {
  trip: string;
  line: string;
  mode: string;
  from: string;
  to: string;
  dep: number;
  arr: number;
  /** minutes against the timetable; undefined without real-time data */
  delay?: number;
  /** [lng, lat, lng, lat …] */
  xy: number[];
  /** cumulative length along xy in km */
  cum: number[];
}

interface RawSegment {
  trips?: { tripId: string; displayName?: string; routeShortName?: string }[];
  mode: string;
  from: { name: string };
  to: { name: string };
  departure: string;
  arrival: string;
  scheduledDeparture: string;
  realTime: boolean;
  polyline: string;
}

/** Cumulative length in km (equirectangular, good enough for speed and interpolation). */
export function cumulative(xy: number[]): number[] {
  const cum = [0];
  for (let k = 2; k < xy.length; k += 2) {
    const c = Math.cos((xy[k - 1]! * Math.PI) / 180);
    cum.push(cum[cum.length - 1]! + Math.hypot((xy[k]! - xy[k - 2]!) * c, xy[k + 1]! - xy[k - 1]!) * 111.195);
  }
  return cum;
}

export function transitousTrips(raw: unknown): Segment[] {
  if (!Array.isArray(raw)) return [];
  const out: Segment[] = [];
  for (const s of raw as RawSegment[]) {
    const t = s.trips?.[0];
    if (!t || !s.polyline) continue;
    const xy = decodePolyline(s.polyline, 5);
    if (xy.length < 4) continue;
    const dep = Date.parse(s.departure);
    const arr = Date.parse(s.arrival);
    if (!Number.isFinite(dep) || !Number.isFinite(arr)) continue;
    out.push({
      trip: t.tripId, line: (t.displayName ?? t.routeShortName ?? '').trim(), mode: s.mode, from: s.from.name, to: s.to.name, dep, arr,
      delay: s.realTime ? Math.round((dep - Date.parse(s.scheduledDeparture)) / 60_000) : undefined, xy, cum: cumulative(xy),
    });
  }
  return out;
}

/** Position on a segment at time t (fraction of the travel time). */
export function pointAt(s: Segment, t: number): { lng: number; lat: number; heading: number } {
  const frac = s.arr > s.dep ? Math.min(1, Math.max(0, (t - s.dep) / (s.arr - s.dep))) : 0;
  const target = frac * s.cum[s.cum.length - 1]!;
  let k = 1;
  while (k < s.cum.length - 1 && s.cum[k]! < target) k++;
  const len = s.cum[k]! - s.cum[k - 1]! || 1;
  const f = Math.min(1, Math.max(0, (target - s.cum[k - 1]!) / len));
  const x0 = s.xy[(k - 1) * 2]!, y0 = s.xy[(k - 1) * 2 + 1]!, x1 = s.xy[k * 2]!, y1 = s.xy[k * 2 + 1]!;
  const heading = (Math.atan2((x1 - x0) * Math.cos((y0 * Math.PI) / 180), y1 - y0) * 180) / Math.PI;
  return { lng: x0 + (x1 - x0) * f, lat: y0 + (y1 - y0) * f, heading: (heading + 360) % 360 };
}

/**
 * One fix per trip at time `now`. A trip between two segments (standing at a stop) is held at the stop for up to
 * 3 minutes. `skip` drops feeds that a dedicated source delivers; `want` filters by mode.
 */
export function segmentFixes(segs: Segment[], now: number, want: (mode: string) => boolean, skip?: (feed: string) => boolean): VehicleFix[] {
  const best = new Map<string, { seg: Segment; active: boolean }>();
  for (const s of segs) {
    if (!want(s.mode)) continue;
    const active = now >= s.dep && now <= s.arr;
    const held = !active && s.arr < now && now - s.arr < 3 * 60_000;
    if (!active && !held) continue;
    const prev = best.get(s.trip);
    if (!prev || (active && !prev.active) || (active === prev.active && s.arr > prev.seg.arr)) best.set(s.trip, { seg: s, active });
  }
  const out: VehicleFix[] = [];
  for (const { seg, active } of best.values()) {
    if (skip?.(transitousFeedOf(seg.trip))) continue;
    const p = pointAt(seg, active ? now : seg.arr);
    const km = seg.cum[seg.cum.length - 1]!;
    const secs = (seg.arr - seg.dep) / 1000;
    out.push({
      id: seg.trip, lng: p.lng, lat: p.lat, heading: p.heading, speed: active && secs > 0 ? (km * 1000) / secs : 0, t: now,
      kind: kindOfMode(seg.mode), line: seg.line, from: undefined, to: undefined, next: seg.to, delay: seg.delay, src: 'Transitous', trip: seg.trip,
    });
  }
  return out;
}

// --- loading: one request per quantised box and minute, shared by all layers that need it -------------------------

const memo = new Map<string, { at: number; promise: Promise<Segment[]> }>();
const TTL = 60_000;

/** Segments in the view for [now - 1 min, now + 4 min]; identical requests of several layers share one fetch. */
export function fetchSegments(bbox: BBox, zoom: number, signal: AbortSignal, now = Date.now()): Promise<Segment[]> {
  const q = (v: number, up: boolean) => (up ? Math.ceil(v * 20) / 20 : Math.floor(v * 20) / 20);
  const [w, s, e, n] = [q(bbox[0], false), q(bbox[1], false), q(bbox[2], true), q(bbox[3], true)];
  const z = Math.round(zoom);
  const start = new Date(Math.floor(now / 60_000) * 60_000 - 60_000).toISOString();
  const end = new Date(Math.floor(now / 60_000) * 60_000 + 4 * 60_000).toISOString();
  const url = `https://api.transitous.org/api/v5/map/trips?min=${s.toFixed(2)},${e.toFixed(2)}&max=${n.toFixed(2)},${w.toFixed(2)}&startTime=${start}&endTime=${end}&zoom=${z}&precision=5`;
  const hit = memo.get(url);
  if (hit && now - hit.at < TTL) return hit.promise;
  for (const [k, v] of memo) if (now - v.at > 5 * TTL) memo.delete(k);
  // the shared request must not be cancelled by one layer going away: it gets its own controller
  const promise = fetchRaw<ArrayBuffer>(url, { format: 'arraybuffer', timeout: 70_000 }).then((r) => runParser('transitousTrips', r.data, { format: 'json' }));
  memo.set(url, { at: now, promise });
  promise.catch(() => memo.delete(url));
  void signal;
  return promise;
}
