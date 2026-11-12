// aisstream.io messages (via the proxy's /ais relay or directly with the user's key) -> ship book. Pure and testable:
// message parsing, the book (latest position, static data, short trail per MMSI), ETA text and subscription boxes.
// Position reports carry Sog (kn), Cog (deg), TrueHeading (511 = n/a); ShipStaticData carries name, type, destination,
// ETA (UTC, no year), draught, dimensions, IMO and call sign.
import type { TrackObject } from '../../render/tracks';
import { KN, shipClass, type ShipProps } from './ais';

export type AisStatic = { name: string; type: number; dest: string; call: string; imo: number; len: number; wid: number; draught: number; eta: { month: number; day: number; hour: number; minute: number } | null };
export type AisPos = { kind: 'pos'; mmsi: number; lng: number; lat: number; sog: number; cog: number; hdg: number; nav: number; name: string; t: number };
export type AisMsg = AisPos | ({ kind: 'static'; mmsi: number } & AisStatic) | { kind: 'error'; text: string };

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** "2026-11-11 17:51:23.338204023 +0000 UTC" -> ms. */
export function parseAisTime(s: unknown): number {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/.exec(String(s ?? ''));
  return m ? Date.parse(`${m[1]}T${m[2]}Z`) : NaN;
}

export function parseAisMessage(text: string, now = Date.now()): AisMsg | null {
  let j: Any;
  try { j = JSON.parse(text); } catch { return null; }
  if (typeof j.error === 'string') return { kind: 'error', text: j.error };
  const meta = j.MetaData as Any | undefined;
  const type = j.MessageType as string | undefined;
  if (!meta || !type || typeof meta.MMSI !== 'number') return null;
  const body = (j.Message?.[type] ?? {}) as Any;
  if (type === 'PositionReport' || type === 'StandardClassBPositionReport') {
    const lat = Number(meta.latitude ?? body.Latitude);
    const lng = Number(meta.longitude ?? body.Longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
    const sog = Number(body.Sog);
    const cog = Number(body.Cog);
    const hdg = Number(body.TrueHeading);
    const t = parseAisTime(meta.time_utc);
    return {
      kind: 'pos', mmsi: meta.MMSI, lng, lat,
      sog: sog >= 0 && sog < 102 ? sog : 0, cog: cog >= 0 && cog < 360 ? cog : -1, hdg: hdg >= 0 && hdg < 360 ? hdg : -1,
      nav: Number.isFinite(Number(body.NavigationalStatus)) ? Number(body.NavigationalStatus) : 15,
      name: String(meta.ShipName ?? '').trim(), t: Number.isFinite(t) ? Math.min(t, now) : now,
    };
  }
  if (type === 'ShipStaticData') {
    const d = (body.Dimension ?? {}) as Any;
    const e = body.Eta as Any | undefined;
    const eta = e && e.Month >= 1 && e.Month <= 12 && e.Day >= 1 && e.Day <= 31 && e.Hour < 24 && e.Minute < 60 ? { month: e.Month, day: e.Day, hour: e.Hour, minute: e.Minute } : null;
    return {
      kind: 'static', mmsi: meta.MMSI, name: String(body.Name ?? meta.ShipName ?? '').trim(), type: Number(body.Type) || 0,
      dest: String(body.Destination ?? '').replace(/@+/g, '').trim(), call: String(body.CallSign ?? '').replace(/@+/g, '').trim(), imo: Number(body.ImoNumber) || 0,
      len: (Number(d.A) || 0) + (Number(d.B) || 0), wid: (Number(d.C) || 0) + (Number(d.D) || 0), draught: Number(body.MaximumStaticDraught) || 0, eta,
    };
  }
  return null;
}

/** "11.09., 14:00 UTC" for an AIS ETA (month/day/hour/minute, no year). */
export const etaText = (e: AisStatic['eta']): string => (e ? `${String(e.day).padStart(2, '0')}.${String(e.month).padStart(2, '0')}., ${String(e.hour).padStart(2, '0')}:${String(e.minute).padStart(2, '0')} UTC` : '');

export type TrailPoint = [lng: number, lat: number, t: number];
const TRAIL_MAX = 40;
const TRAIL_MIN_MS = 20_000;
const TRAIL_MIN_KM = 0.03;

export class AisBook {
  readonly ships = new Map<number, AisPos>();
  readonly statics = new Map<number, AisStatic>();
  readonly trails = new Map<number, TrailPoint[]>();
  constructor(private cap = 8000) {}

  apply(m: AisMsg): void {
    if (m.kind === 'static') {
      const prev = this.statics.get(m.mmsi);
      const { kind: _k, mmsi: _m, ...rest } = m;
      this.statics.set(m.mmsi, { ...rest, name: rest.name || prev?.name || '', dest: rest.dest || prev?.dest || '' });
      return;
    }
    if (m.kind !== 'pos') return;
    const prev = this.ships.get(m.mmsi);
    if (prev && prev.t > m.t) return;
    this.ships.set(m.mmsi, { ...m, name: m.name || prev?.name || '' });
    this.addTrail(m.mmsi, m.lng, m.lat, m.t);
    if (this.ships.size > this.cap * 1.1) this.prune();
  }

  /** Appends a position to the trail of a ship (at most every 20 s and 30 m, 40 points). */
  addTrail(mmsi: number, lng: number, lat: number, t: number): void {
    const tr = this.trails.get(mmsi) ?? [];
    const last = tr[tr.length - 1];
    if (last && (t <= last[2] || t - last[2] < TRAIL_MIN_MS || Math.hypot((lng - last[0]) * Math.cos((lat * Math.PI) / 180), lat - last[1]) * 111.2 < TRAIL_MIN_KM)) return;
    tr.push([lng, lat, t]);
    if (tr.length > TRAIL_MAX) tr.shift();
    this.trails.set(mmsi, tr);
  }

  /** Drops the oldest ships until `cap` remain (and everything older than `maxAgeMs`). */
  prune(now = Date.now(), maxAgeMs = 30 * 60_000): void {
    for (const [k, s] of this.ships) if (now - s.t > maxAgeMs) { this.ships.delete(k); this.trails.delete(k); }
    if (this.ships.size > this.cap) {
      const old = [...this.ships.entries()].sort((a, b) => a[1].t - b[1].t).slice(0, this.ships.size - this.cap);
      for (const [k] of old) { this.ships.delete(k); this.trails.delete(k); }
    }
  }

  tracks(): TrackObject[] {
    const out: TrackObject[] = [];
    for (const s of this.ships.values()) {
      const st = this.statics.get(s.mmsi);
      const moving = s.sog >= 0.5;
      const heading = moving && s.cog >= 0 ? s.cog : s.hdg >= 0 ? s.hdg : s.cog >= 0 ? s.cog : 0;
      out.push({
        id: String(s.mmsi), lng: s.lng, lat: s.lat, heading, speed: moving ? s.sog * KN : 0, t: s.t,
        props: { mmsi: s.mmsi, sog: s.sog, cog: s.cog, hdg: s.hdg, nav: s.nav, moving, cls: shipClass(st?.type), name: st?.name || s.name, live: true } satisfies ShipProps & { cls: string; name: string; live: boolean },
      });
    }
    return out;
  }
}

/** Subscription boxes `[[south, west], [north, east]]` for a view (at most 2: split at the antimeridian, clamped). */
export function subscriptionBoxes(b: { west: number; south: number; east: number; north: number }): [[number, number], [number, number]][] {
  const s = Math.max(-90, b.south);
  const n = Math.min(90, b.north);
  const width = b.east - b.west;
  if (width >= 360) return [[[s, -180], [n, 180]]];
  const w = ((((b.west + 180) % 360) + 360) % 360) - 180;
  const e = w + width;
  if (e <= 180) return [[[s, w], [n, e]]];
  return [[[s, w], [n, 180]], [[s, -180], [n, e - 360]]];
}
