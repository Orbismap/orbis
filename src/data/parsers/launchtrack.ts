// Launch tracker: detailed Launch Library 2 records (live bucket `space/launches/tracker.json`, the next ~20 launches,
// `mode=detailed`) and a SIMULATED ascent ground track. Public rocket telemetry does not exist: position, altitude and
// speed are modelled for a Falcon-9 class two-stage rocket from the pad, the launch azimuth (derived from the target
// inclination) and the target orbit. Good for "roughly where is it now", not for tracking. Port of the old Orbis tracker.
import { destination } from '../../core/geo';

export type LaunchVideo = { url: string; title: string; source: string; publisher: string; priority: number };
export type LaunchDetail = {
  id: string; name: string; net: number; windowStart?: number; windowEnd?: number;
  status: string; statusName: string; statusInfo: string; provider: string; rocket: string; mission: string; missionType: string; desc: string;
  orbit: string; orbitName: string; altKm: number; incDeg: number;
  pad: string; place: string; lat: number; lng: number; probability: number | null; webcastLive: boolean; holdReason: string; failReason: string;
  videos: LaunchVideo[];
};

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Target altitude (km) and inclination (deg) by LL2 orbit abbreviation, used where the record carries none. */
const ORBIT: Record<string, { altKm: number; inc: number }> = {
  ISS: { altKm: 410, inc: 51.6 }, LEO: { altKm: 450, inc: 50 }, VLEO: { altKm: 260, inc: 50 }, SSO: { altKm: 550, inc: 97.5 }, POLAR: { altKm: 550, inc: 92 },
  Suborbital: { altKm: 90, inc: 30 }, MEO: { altKm: 20180, inc: 58 }, GTO: { altKm: 35786, inc: 27 }, GEO: { altKm: 35786, inc: 0 }, HEO: { altKm: 35786, inc: 40 },
  TLI: { altKm: 380000, inc: 30 }, 'Lunar Orbit': { altKm: 100, inc: 45 },
};

export function launchTracker(raw: unknown): LaunchDetail[] {
  const list = (raw as { results?: Any[] } | null)?.results;
  if (!Array.isArray(list)) return [];
  const out: LaunchDetail[] = [];
  for (const l of list) {
    const net = Date.parse(String(l.net));
    const lat = Number(l.pad?.latitude);
    const lng = Number(l.pad?.longitude);
    if (!Number.isFinite(net) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const orb = l.mission?.orbit as Any | undefined;
    const abbrev = String(orb?.abbrev ?? '');
    const hit = ORBIT[abbrev] ?? { altKm: 400, inc: 45 };
    const alt = Number(orb?.altitude);
    const inc = Number(orb?.inclination);
    const videos: LaunchVideo[] = ((l.vid_urls ?? []) as Any[])
      .filter((v) => typeof v.url === 'string' && /^https:\/\//.test(v.url))
      .map((v) => ({ url: v.url as string, title: String(v.title ?? ''), source: String(v.source ?? ''), publisher: String(v.publisher ?? ''), priority: Number(v.priority ?? 99) }))
      .sort((a, b) => a.priority - b.priority);
    out.push({
      id: String(l.id), name: String(l.name ?? ''), net, windowStart: Date.parse(String(l.window_start)) || undefined, windowEnd: Date.parse(String(l.window_end)) || undefined,
      status: String(l.status?.abbrev ?? ''), statusName: String(l.status?.name ?? ''), statusInfo: String(l.status?.description ?? ''),
      provider: String(l.launch_service_provider?.name ?? ''), rocket: String(l.rocket?.configuration?.full_name ?? l.rocket?.configuration?.name ?? ''),
      mission: String(l.mission?.name ?? ''), missionType: String(l.mission?.type ?? ''), desc: String(l.mission?.description ?? ''),
      orbit: abbrev, orbitName: String(orb?.name ?? abbrev), altKm: Number.isFinite(alt) && alt > 100 ? alt : hit.altKm, incDeg: Number.isFinite(inc) ? inc : hit.inc,
      pad: String(l.pad?.name ?? ''), place: String(l.pad?.location?.name ?? ''), lat, lng,
      probability: typeof l.probability === 'number' ? l.probability : null, webcastLive: l.webcast_live === true,
      holdReason: String(l.holdreason ?? ''), failReason: String(l.failreason ?? ''), videos,
    });
  }
  return out.sort((a, b) => a.net - b.net);
}

export const STATUS_DE: Record<string, string> = {
  Go: 'Startbereit', 'Go for Launch': 'Startbereit', TBD: 'Termin offen', TBC: 'Termin unbestätigt', Hold: 'Angehalten', 'In Flight': 'Im Flug',
  Success: 'Erfolgreich', Failure: 'Fehlgeschlagen', Partial: 'Teilerfolg',
};

// ---- simulated ascent -------------------------------------------------------------------------------------------------
const lerp = (pts: [number, number][], t: number) => {
  if (t <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i]![0]) {
      const [x0, v0] = pts[i - 1]!;
      const [x1, v1] = pts[i]!;
      return v0 + ((v1 - v0) * (t - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1]![1];
};
// plausible profiles of a two-stage rocket to low Earth orbit: speed (km/s), altitude (km), flight-path angle (deg) over seconds after T-0
const V: [number, number][] = [[0, 0], [30, 0.07], [60, 0.25], [90, 0.55], [145, 1.2], [180, 1.65], [240, 2.35], [300, 3.1], [360, 3.9], [420, 4.9], [480, 6.0], [540, 7.0], [600, 7.8], [680, 7.9]];
const H: [number, number][] = [[0, 0], [30, 0.8], [60, 3], [90, 8], [120, 15], [180, 35], [240, 65], [300, 100], [360, 128], [420, 158], [480, 188], [540, 205], [600, 212], [680, 215]];
const PITCH: [number, number][] = [[0, 90], [30, 84], [60, 74], [90, 63], [120, 53], [145, 46], [180, 37], [240, 25], [300, 17], [360, 10], [420, 5], [480, 2], [540, 0], [680, 0]];
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Seconds after T-0 at which the simulated second stage cuts off. */
export const flightEndSec = (d: Pick<LaunchDetail, 'orbit' | 'altKm'>): number => (d.orbit === 'Suborbital' ? 300 : d.altKm > 2000 ? 1250 : 680);
const energy = (d: Pick<LaunchDetail, 'altKm'>) => Math.min(1.12, Math.max(1, 0.92 + d.altKm / 6000));

/** Launch azimuth (deg) from pad latitude and target inclination; polar launches go south from pads that usually fly that way. */
export function azimuthOf(d: Pick<LaunchDetail, 'incDeg' | 'lat' | 'place' | 'pad'>): number {
  const i = Math.abs(d.incDeg) % 180;
  const southbound = /Vandenberg|Mahia|Kodiak|Uchinoura|Kazakhstan|Jiuquan|Taiyuan/.test(`${d.place},${d.pad}`);
  if (i >= 85 || Math.cos(rad(d.lat)) < 0) return southbound && d.lat > 0 ? 190 : 0;
  const a = deg(Math.asin(Math.min(1, Math.cos(rad(i)) / Math.cos(rad(Math.abs(d.lat))))));
  return Math.round((d.lat >= 0 ? 90 + a : 90 - a) * 10) / 10;
}

export type LivePoint = { lng: number; lat: number; altKm: number; speedKmh: number; az: number; downrangeKm: number };

/** Simulated position `tSec` after T-0 (null before liftoff). */
export function trackAt(d: LaunchDetail, tSec: number): LivePoint | null {
  if (tSec < 0) return null;
  const t = Math.min(tSec, flightEndSec(d));
  const f = energy(d);
  const v = lerp(V, t) * f;
  const h = Math.min(lerp(H, t) * Math.max(0.7, Math.min(1.1, 0.8 + d.altKm / 1500)), d.altKm > 2000 ? 230 : d.altKm);
  let dist = 0;
  for (let s = 0; s < t; s += 10) {
    const mid = Math.min(t, s + 5);
    dist += lerp(V, mid) * f * Math.cos(rad(lerp(PITCH, mid))) * 10;
  }
  const az = azimuthOf(d);
  const [lng, lat] = destination([d.lng, d.lat], az, dist);
  return { lng, lat, altKm: h, speedKmh: v * 3600, az, downrangeKm: dist };
}

export type Phase = { tSec: number; phase: 'pre' | 'active' | 'orbit'; label: string; at: LivePoint | null };

/** Mission phase from the time to T-0 (seconds, negative = countdown) with a plain-language label. */
export function phaseAt(d: LaunchDetail, now: number): Phase {
  const tSec = Math.round((now - d.net) / 1000);
  const end = flightEndSec(d);
  if (tSec < 0) {
    const label = tSec > -600 ? 'Letzte Startvorbereitungen' : tSec > -3600 ? 'Betankung und Startvorbereitung' : 'Countdown läuft';
    return { tSec, phase: 'pre', label, at: null };
  }
  if (tSec > end) return { tSec, phase: 'orbit', label: tSec < end + 3 * 3600 ? 'Bahn erreicht oder Flug nach Antriebsende' : 'Gestartet', at: null };
  const label = tSec < 70 ? 'Aufstieg' : tSec < 150 ? 'Maximaler Staudruck (Max Q) und Stufentrennung naht' : tSec < 180 ? 'Stufentrennung' : 'Zweite Stufe brennt';
  return { tSec, phase: 'active', label, at: trackAt(d, tSec) };
}

/** Ground track from liftoff to `upToSec` (or the cut-off) as lng/lat points, every `step` seconds. */
export function groundTrack(d: LaunchDetail, upToSec: number, step = 20): [number, number][] {
  const end = Math.min(upToSec, flightEndSec(d));
  const pts: [number, number][] = [];
  for (let t = 0; t <= end; t += step) { const a = trackAt(d, t); if (a) pts.push([a.lng, a.lat]); }
  const last = trackAt(d, end);
  if (last) pts.push([last.lng, last.lat]);
  return pts;
}

/** "T-00:12:30" / "T+02:05" label. */
export function tLabel(sec: number): string {
  const a = Math.abs(sec);
  const h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), s = a % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `T${sec < 0 ? '−' : '+'}${h ? `${p(h)}:` : ''}${p(m)}:${p(s)}`;
}
