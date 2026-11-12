// River lines (Natural Earth 50m, public domain) coloured by GloFAS discharge at a bounded number of stations.
// Pure: station choice, probe layout and the segmentation of the lines between stations.
import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { FloodStation } from '../../data/parsers/flood';
import { riverStatus } from '../../data/parsers/flood';

export interface RiverLine { name: string; rank: number; coords: [number, number][] }
export interface Station { id: string; river: number; name: string; lng: number; lat: number; /** arc fraction along its river 0..1 */ at: number }

/** Offsets (degrees) of the probes around a station: centre plus the four neighbours of the 0.05° model grid. */
export const PROBE_OFFSETS: [number, number][] = [[0, 0], [0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05]];

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
export function distKm(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function riversOf(fc: { features: { geometry: { type: string; coordinates: unknown } | null; properties?: Record<string, unknown> | null }[] }): RiverLine[] {
  const out: RiverLine[] = [];
  for (const f of fc.features) {
    if (f.geometry?.type !== 'LineString') continue;
    const coords = f.geometry.coordinates as [number, number][];
    if (coords.length < 2) continue;
    out.push({ name: String(f.properties?.n ?? ''), rank: Number(f.properties?.r ?? 9), coords });
  }
  return out;
}

const lengthKm = (c: [number, number][]) => c.slice(1).reduce((s, p, i) => s + distKm(c[i]!, p), 0);

/** Point at arc fraction `f` (0..1) along the line. */
export function pointAt(c: [number, number][], f: number): [number, number] {
  const total = lengthKm(c);
  let target = f * total;
  for (let i = 1; i < c.length; i++) {
    const d = distKm(c[i - 1]!, c[i]!);
    if (target <= d || i === c.length - 1) {
      const t = d > 0 ? Math.min(1, target / d) : 0;
      return [c[i - 1]![0] + (c[i]![0] - c[i - 1]![0]) * t, c[i - 1]![1] + (c[i]![1] - c[i - 1]![1]) * t];
    }
    target -= d;
  }
  return c[c.length - 1]!;
}

/**
 * Picks stations: biggest rivers first (rank, then length), one station per ~`spacingKm` of river (at least 2, at most
 * 8), until `cap` stations are used. Unnamed small segments (rank > maxRank) are skipped.
 */
export function pickStations(rivers: readonly RiverLine[], cap: number, opts: { maxRank?: number; spacingKm?: number } = {}): Station[] {
  const maxRank = opts.maxRank ?? 4;
  const spacing = opts.spacingKm ?? 500;
  const order = rivers
    .map((r, i) => ({ r, i, len: lengthKm(r.coords) }))
    .filter((x) => x.r.rank <= maxRank && x.len >= 150)
    .sort((a, b) => a.r.rank - b.r.rank || b.len - a.len);
  const out: Station[] = [];
  for (const { r, i, len } of order) {
    const k = Math.max(2, Math.min(8, Math.round(len / spacing)));
    if (out.length + k > cap) continue;
    for (let m = 0; m < k; m++) {
      const at = (m + 0.5) / k;
      const [lng, lat] = pointAt(r.coords, at);
      out.push({ id: `${i}:${m}`, river: i, name: r.name, lng: +lng.toFixed(2), lat: +lat.toFixed(2), at });
    }
  }
  return out;
}

/** All probe coordinates for the stations, station-major (what `floodStations` groups by). */
export function probeCoords(stations: readonly Station[]): { lat: number[]; lng: number[] } {
  const lat: number[] = [];
  const lng: number[] = [];
  for (const s of stations) {
    for (const [dx, dy] of PROBE_OFFSETS) {
      lat.push(+(s.lat + dy).toFixed(3));
      lng.push(+(s.lng + dx).toFixed(3));
    }
  }
  return { lat, lng };
}

export interface PieceProps {
  id: string;
  name: string;
  /** station that describes the piece in the card */
  sid: string;
  /** discharge now, m³/s (interpolated along the river) */
  q: number;
  /** discharge ÷ median, 0 when unknown */
  ratio: number;
  /** relative change within 7 days */
  tr: number;
  /** log width 0..1 */
  lw: number;
}

export interface RiverStationData { station: Station; data: FloodStation }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Splits every river with at least one valid station into pieces; q is interpolated geometrically between the
 * stations along the line, ratio and trend linearly. Stations far below the river's median (probe missed the
 * channel) are ignored.
 */
export function buildPieces(rivers: readonly RiverLine[], results: readonly RiverStationData[], minPieceKm = 40): FeatureCollection<LineString, PieceProps> {
  const byRiver = new Map<number, { st: Station; now: number; ratio: number; tr: number }[]>();
  for (const { station, data } of results) {
    const s = riverStatus(data);
    if (!s || s.now < 0.3) continue;
    const list = byRiver.get(station.river) ?? [];
    list.push({ st: station, now: s.now, ratio: s.ratio ?? 0, tr: s.change7 });
    byRiver.set(station.river, list);
  }
  const features: Feature<LineString, PieceProps>[] = [];
  for (const [ri, raw] of byRiver) {
    const river = rivers[ri]!;
    const sorted = [...raw].sort((a, b) => a.st.at - b.st.at);
    const med = [...sorted].map((x) => x.now).sort((a, b) => a - b)[Math.floor(sorted.length / 2)]!;
    const st = sorted.filter((x) => x.now >= 0.2 * med);
    if (!st.length) continue;
    const total = lengthKm(river.coords);
    const valueAt = (f: number) => {
      if (f <= st[0]!.st.at) return { ...st[0]!, sid: st[0]!.st.id };
      if (f >= st[st.length - 1]!.st.at) return { ...st[st.length - 1]!, sid: st[st.length - 1]!.st.id };
      let k = 1;
      while (st[k]!.st.at < f) k++;
      const a = st[k - 1]!;
      const b = st[k]!;
      const t = (f - a.st.at) / (b.st.at - a.st.at);
      return {
        now: Math.exp(lerp(Math.log(a.now), Math.log(b.now), t)), ratio: a.ratio && b.ratio ? lerp(a.ratio, b.ratio, t) : a.ratio || b.ratio,
        tr: lerp(a.tr, b.tr, t), sid: (t < 0.5 ? a : b).st.id, st: a.st,
      };
    };
    let acc: [number, number][] = [river.coords[0]!];
    let accKm = 0;
    let done = 0;
    const flush = (endKm: number) => {
      if (acc.length < 2) return;
      const mid = (done + endKm) / 2 / total;
      const v = valueAt(Math.min(1, Math.max(0, mid)));
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: acc },
        properties: {
          id: `${ri}.${features.length}`, name: river.name, sid: v.sid, q: Math.round(v.now * 10) / 10, ratio: Math.round(v.ratio * 100) / 100,
          tr: Math.round(v.tr * 100) / 100, lw: Math.min(1, Math.max(0, (Math.log10(Math.max(1, v.now)) - 0.5) / 3.7)),
        },
      });
    };
    let pos = 0;
    for (let i = 1; i < river.coords.length; i++) {
      const d = distKm(river.coords[i - 1]!, river.coords[i]!);
      pos += d;
      accKm += d;
      acc.push(river.coords[i]!);
      if (accKm >= minPieceKm || i === river.coords.length - 1) {
        flush(pos);
        done = pos;
        acc = [river.coords[i]!];
        accKm = 0;
      }
    }
  }
  return { type: 'FeatureCollection', features };
}
