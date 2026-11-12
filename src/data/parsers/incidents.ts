// Incident reconstruction: track file parser and the interpolation along a flight track (pure, tested).
// Track format (assets bucket, data/incidents/<id>/track.json): { units, cols, pts: [[t, lat, lon, alt ft|null, gs kt, trk °, 1?]] }.

/** [Unix s, lat, lon, altitude ft | null, groundspeed kt, course °, 1 = altitude/position computed rather than measured] */
export type TrackPoint = [number, number, number, number | null, number, number, 1?];

export interface TrackSample {
  t: number;
  lat: number;
  lon: number;
  /** ft; null: no altitude in the source */
  alt: number | null;
  /** altitude is extrapolated or computed, not a fresh measurement */
  estimated: boolean;
  gs: number;
  trk: number;
  /** climb/sink rate in ft/min from the neighbouring points, null without altitudes */
  vs: number | null;
  i: number;
}

/** Parser `incidentTrack`: validates the file and returns the points in time order. */
export function incidentTrack(raw: unknown): TrackPoint[] {
  const pts = (raw as { pts?: unknown } | null)?.pts;
  if (!Array.isArray(pts)) return [];
  const ok = (pts as unknown[]).filter(
    (p): p is TrackPoint => Array.isArray(p) && p.length >= 6 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]),
  );
  return ok.sort((a, b) => a[0] - b[0]);
}

const shortest = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

/** Index of the last point with time <= t (-1 before the first) */
export function indexAt(pts: readonly TrackPoint[], t: number): number {
  let lo = 0;
  let hi = pts.length - 1;
  if (!pts.length || t < pts[0]![0]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid]![0] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function lastKnown(pts: readonly TrackPoint[], i: number): { k: number; vs: number } | null {
  let k = i;
  while (k >= 0 && pts[k]![3] == null) k--;
  if (k < 0) return null;
  let j = k - 1;
  while (j >= 0 && pts[j]![3] == null) j--;
  const span = j >= 0 ? pts[k]![0] - pts[j]![0] : 0;
  return { k, vs: span > 0 ? ((pts[k]![3]! - pts[j]![3]!) / span) * 60 : 0 };
}

function nextKnown(pts: readonly TrackPoint[], i: number): number | null {
  for (let q = i + 1; q < pts.length; q++) if (pts[q]![3] != null) return q;
  return null;
}

/** State at time t (Unix s), linear between reports; before/after the track the first/last point. Needs >= 1 point. */
export function sampleAt(pts: readonly TrackPoint[], t: number): TrackSample {
  const i = Math.max(0, indexAt(pts, t));
  const a = pts[i]!;
  const b = pts[Math.min(i + 1, pts.length - 1)]!;
  const span = b[0] - a[0];
  const f = span > 0 ? Math.min(1, Math.max(0, (t - a[0]) / span)) : 0;
  const known = a[3] != null && b[3] != null;
  let alt = known ? a[3]! + (b[3]! - a[3]!) * f : a[3];
  let vs = known && span > 0 ? ((b[3]! - a[3]!) / span) * 60 : null;
  let estimated = (a[3] != null && b[3] == null) || !!(a[6] || b[6]);
  if (!known) {
    // no measurement (end of the track): carry the last known rate to the ground instead of jumping to 0
    const lk = lastKnown(pts, i);
    const q = lk ? nextKnown(pts, lk.k) : null;
    if (lk && q != null) {
      const p0 = pts[lk.k]!;
      const p1 = pts[q]!;
      const k = (t - p0[0]) / (p1[0] - p0[0]);
      alt = p0[3]! + (p1[3]! - p0[3]!) * Math.min(1, Math.max(0, k));
      vs = ((p1[3]! - p0[3]!) / (p1[0] - p0[0])) * 60;
      estimated = true;
    } else if (lk) {
      alt = Math.max(0, pts[lk.k]![3]! + (lk.vs / 60) * (t - pts[lk.k]![0]));
      vs = alt > 0 ? lk.vs : 0;
      estimated = true;
    }
  }
  return {
    t: Math.min(Math.max(t, pts[0]![0]), pts[pts.length - 1]![0]),
    lat: a[1] + (b[1] - a[1]) * f,
    lon: a[2] + (b[2] - a[2]) * f,
    alt,
    estimated,
    gs: a[4] + (b[4] - a[4]) * f,
    trk: (a[5] + shortest(a[5], b[5]) * f + 360) % 360,
    vs,
    i,
  };
}

/** Replaces {{ft:35000}} (feet), {{kn:437}} (knots), {{fpm:20000}} (ft/min), {{m:180}} (metres) in event texts. */
export function localizeUnits(text: string): string {
  const n = (v: number, d = 0) => v.toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d });
  return text.replace(/\{\{(ft|kn|fpm|m):(-?[\d.]+)\}\}/g, (_all, kind: string, v: string) => {
    const x = Number(v);
    if (kind === 'ft') return `${n(x * 0.3048)} m (${n(x)} ft)`;
    if (kind === 'kn') return `${n(x * 1.852)} km/h (${n(x)} kn)`;
    if (kind === 'fpm') return `${n((x * 0.3048) / 60, 1)} m/s (${n(x)} ft/min)`;
    return `${n(x)} m`;
  });
}

// ---- incident definitions (data files in src/data/incidents/) ----------------------------

export interface IncidentLink { label: string; url: string }
export interface IncidentEvent {
  /** Unix s, UTC */
  t: number;
  kind: 'flight' | 'radio' | 'weather' | 'impact' | 'info';
  label: string;
  text?: string;
  /** location of the marker; without it the position on the track at `t` */
  at?: { lat: number; lon: number };
  src?: IncidentLink;
}
export interface IncidentMedia {
  title: string;
  platform: string;
  url: string;
  /** file path in the assets bucket (relative to its root): played inline */
  file?: string;
  group?: string;
  note?: string;
  t?: number;
  at?: { lat: number; lon: number };
}
export interface IncidentDef {
  id: string;
  title: string;
  shortTitle?: string;
  subtitle: string;
  lat: number;
  lon: number;
  place: string;
  summary: string;
  aircraft: { callsign: string; reg: string; hex: string; type: string; from: string; to: string };
  /** track file in the assets bucket */
  track: string;
  /** time range of the reconstruction, Unix s */
  range: { start: number; end: number };
  dataNotes: string[];
  events: IncidentEvent[];
  media: IncidentMedia[];
  audio?: { src: string; title: string; credit: IncidentLink; startUnix?: number };
  sources: IncidentLink[];
}
export const defineIncident = (d: IncidentDef): IncidentDef => d;
