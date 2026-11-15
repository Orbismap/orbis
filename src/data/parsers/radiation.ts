// Ambient gamma dose rate networks (BfS DE, STUK FI, Health Canada, Safecast) -> one slim point format in µSv/h.
import type { Feature, FeatureCollection, LineString, MultiPolygon, Point, Polygon } from 'geojson';

export type DoseProps = {
  id: string;
  name: string;
  /** µSv/h */
  v: number;
  /** measurement time, ms since epoch */
  t: number;
  net: 'bfs' | 'stuk' | 'hc' | 'safecast';
  /** BfS only: terrestrial + cosmic share and altitude */
  cosmic?: number;
  terrestrial?: number;
  alt?: number;
  /** BfS only: "in Betrieb", "Testbetrieb", "defekt" and the station code of the network */
  status?: string;
  kenn?: string;
  /** Safecast only: country code */
  country?: string;
};
export type DoseCollection = FeatureCollection<Point, DoseProps>;

const fc = (features: Feature<Point, DoseProps>[]): DoseCollection => ({ type: 'FeatureCollection', features });
const pt = <P,>(lon: number, lat: number, properties: P): Feature<Point, P> => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties });

/** BfS ODL 1 h mean, WFS GeoJSON (`odlinfo_odl_1h_latest`). Stations out of order or without value are dropped. */
export function bfsDose(raw: unknown): DoseCollection {
  const out: Feature<Point, DoseProps>[] = [];
  const list = (raw as { features?: { geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> }[] } | null)?.features;
  for (const f of Array.isArray(list) ? list : []) {
    const p = f.properties;
    const c = f.geometry?.coordinates;
    const v = Number(p?.value);
    if (!p || !c || c.length < 2 || p.value == null || !Number.isFinite(v) || v < 0) continue;
    const num = (x: unknown) => (x == null || !Number.isFinite(Number(x)) ? undefined : Number(x));
    out.push(
      pt(c[0]!, c[1]!, {
        id: `bfs:${p.id ?? out.length}`,
        name: String(p.name ?? 'ODL-Messstelle'),
        v,
        t: Date.parse(String(p.end_measure ?? '')) || 0,
        net: 'bfs',
        cosmic: num(p.value_cosmic),
        terrestrial: num(p.value_terrestrial),
        alt: num(p.height_above_sea),
        status: typeof p.site_status_text === 'string' ? p.site_status_text : undefined,
        kenn: p.kenn == null ? undefined : String(p.kenn),
      }),
    );
  }
  return fc(out);
}

/** Snapshot rows `[name, lon, lat, µSv/h, unix seconds]` of STUK (FI) and Health Canada. */
function rows(raw: unknown, net: 'stuk' | 'hc'): DoseCollection {
  const out: Feature<Point, DoseProps>[] = [];
  for (const r of Array.isArray(raw) ? (raw as unknown[][]) : []) {
    const lon = Number(r[1]);
    const lat = Number(r[2]);
    const v = Number(r[3]);
    const t = Number(r[4]) * 1000;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(v) || v <= 0) continue;
    out.push(pt(lon, lat, { id: `${net}:${String(r[0])}:${out.length}`, name: String(r[0] ?? ''), v, t: Number.isFinite(t) ? t : 0, net }));
  }
  return fc(out);
}
export const stukDose = (raw: unknown) => rows(raw, 'stuk');
export const hcDose = (raw: unknown) => rows(raw, 'hc');

interface SafecastDevice {
  device_urn?: string;
  when_captured?: string;
  loc_lat?: number;
  loc_lon?: number;
  loc_name?: string;
  loc_country?: string;
  lnd_7318u?: number;
  lnd_7318c?: number;
  lnd_7128ec?: number;
  lnd_712u?: number;
}

/** Safecast devices report counts per minute; the tube's factor turns them into µSv/h. Readings older than `maxAgeDays` (default 7) are dropped. */
export function safecastDose(raw: unknown, args?: { now?: number; maxAgeDays?: number }): DoseCollection {
  const now = args?.now ?? Date.now();
  const cutoff = now - (args?.maxAgeDays ?? 7) * 86_400_000;
  const out: Feature<Point, DoseProps>[] = [];
  for (const d of (Array.isArray(raw) ? raw : []) as SafecastDevice[]) {
    const t = Date.parse(d.when_captured ?? '');
    if (d.loc_lat == null || d.loc_lon == null || !Number.isFinite(t) || t < cutoff) continue;
    const v = d.lnd_7318u != null ? d.lnd_7318u / 334 : d.lnd_7318c != null ? d.lnd_7318c / 334 : d.lnd_7128ec != null ? d.lnd_7128ec / 108 : d.lnd_712u != null ? d.lnd_712u / 108 : NaN;
    if (!Number.isFinite(v) || v <= 0 || v > 100) continue;
    out.push(pt(d.loc_lon, d.loc_lat, { id: `safecast:${d.device_urn ?? out.length}`, name: d.loc_name ?? 'Safecast-Sensor', v: Math.round(v * 1000) / 1000, t, net: 'safecast', country: d.loc_country }));
  }
  return fc(out);
}

export type AirProps = {
  id: string;
  name: string;
  /** measurement time, ms since epoch */
  t: number;
  /** µg/m³ */
  pm25: number;
  pm1?: number;
  pm10?: number;
  /** ISO country code of the sensor's location */
  country?: string;
  /** device readings, when the sensor sends them */
  temp?: number;
  humid?: number;
  press?: number;
  bat?: number;
  /** link to the device dashboard, if the sensor reports one */
  dash?: string;
};
export type AirCollection = FeatureCollection<Point, AirProps>;

interface AirDevice {
  device_urn?: string;
  device_class?: string;
  when_captured?: string;
  loc_lat?: number;
  loc_lon?: number;
  loc_name?: string;
  loc_country?: string;
  pms_pm01_0?: number;
  pms_pm02_5?: number;
  pms_pm10_0?: number;
  env_temp?: number;
  env_humid?: number;
  env_press?: number;
  bat_voltage?: number;
  dev_dashboard?: string;
}

const fin = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Safecast AirNote particulate sensors (PM1 / PM2.5 / PM10) from the same device snapshot as the dose rates.
 * Radiation-only devices are skipped; readings older than `maxAgeDays` (default 30) and obvious glitches (> 1000 µg/m³) are dropped.
 */
export function safecastAir(raw: unknown, args?: { now?: number; maxAgeDays?: number }): AirCollection {
  const now = args?.now ?? Date.now();
  const cutoff = now - (args?.maxAgeDays ?? 30) * 86_400_000;
  const out: Feature<Point, AirProps>[] = [];
  for (const d of (Array.isArray(raw) ? raw : []) as AirDevice[]) {
    if (!/airnote/i.test(d.device_class ?? '')) continue;
    const t = Date.parse(d.when_captured ?? '');
    const pm25 = fin(d.pms_pm02_5);
    if (d.loc_lat == null || d.loc_lon == null || !Number.isFinite(t) || t < cutoff || pm25 === undefined || pm25 < 0 || pm25 > 1000) continue;
    const pm1 = fin(d.pms_pm01_0);
    const pm10 = fin(d.pms_pm10_0);
    const dash = typeof d.dev_dashboard === 'string' && /^https?:\/\//.test(d.dev_dashboard) ? d.dev_dashboard : undefined;
    out.push(
      pt(d.loc_lon, d.loc_lat, {
        id: `safecast-air:${d.device_urn ?? out.length}`,
        name: d.loc_name?.trim() || 'AirNote-Sensor',
        t,
        pm25: round1(pm25),
        pm1: pm1 === undefined ? undefined : round1(pm1),
        pm10: pm10 === undefined ? undefined : round1(pm10),
        country: d.loc_country,
        temp: fin(d.env_temp),
        humid: fin(d.env_humid),
        press: fin(d.env_press),
        bat: fin(d.bat_voltage),
        dash,
      }),
    );
  }
  return { type: 'FeatureCollection', features: out };
}

export type VoronoiProps = {
  id: string;
  /** interpolated dose rate, µSv/h */
  v: number;
  /** end of the measurement hour, ms since epoch */
  t: number;
};
export type VoronoiCollection = FeatureCollection<Polygon | MultiPolygon, VoronoiProps>;

/**
 * BfS ODL Voronoi interpolation (`odl_brutto_1h_voronoi`): one polygon per station cell for one hour.
 * Request with `srsName=EPSG:4326`; cells without a value are dropped.
 */
// Douglas-Peucker simplification for a ring of [lon, lat] points. Removes collinear/redundant vertices
// and tames self-intersecting coastal polygons produced by the BfS Voronoi reprojection.
function simplifyRing(ring: number[][], tolerance: number): number[][] {
  if (ring.length <= 4) return ring;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  let maxDist = 0;
  let maxIdx = 0;
  const dx = last[0]! - first[0]!;
  const dy = last[1]! - first[1]!;
  const lenSq = dx * dx + dy * dy;
  for (let i = 1; i < ring.length - 1; i++) {
    const p = ring[i]!;
    let dist: number;
    if (lenSq === 0) {
      dist = Math.hypot(p[0]! - first[0]!, p[1]! - first[1]!);
    } else {
      const t = ((p[0]! - first[0]!) * dx + (p[1]! - first[1]!) * dy) / lenSq;
      const projX = first[0]! + t * dx;
      const projY = first[1]! + t * dy;
      dist = Math.hypot(p[0]! - projX, p[1]! - projY);
    }
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }
  if (maxDist > tolerance) {
    const left = simplifyRing(ring.slice(0, maxIdx + 1), tolerance);
    const right = simplifyRing(ring.slice(maxIdx), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function convexHull(points: number[][]): number[][] {
  if (points.length <= 3) return points;
  const pts = points.slice().sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
  const cross = (o: number[], a: number[], b: number[]) => (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
  const lower: number[][] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop(); lower.push(p); }
  const upper: number[][] = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]!; while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function simplifyPolygon(poly: Polygon | MultiPolygon): Polygon | MultiPolygon {
  if (poly.type === 'Polygon') {
    return { type: 'Polygon', coordinates: poly.coordinates.map((ring) => {
      const s = simplifyRing(ring, 0.001);
      return s.length >= 4 ? s : ring;
    }) };
  }
  return { type: 'MultiPolygon', coordinates: poly.coordinates.map((p) => p.map((ring) => {
    const s = simplifyRing(ring, 0.001);
    return s.length >= 4 ? s : ring;
  })) };
}

export function bfsVoronoi(raw: unknown): VoronoiCollection {
  const out: Feature<Polygon | MultiPolygon, VoronoiProps>[] = [];
  const list = (raw as { features?: { geometry?: { type?: string }; properties?: Record<string, unknown> }[] } | null)?.features;
  for (const f of Array.isArray(list) ? list : []) {
    const g = f.geometry;
    const p = f.properties;
    if (!p || !g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    const v = Number(p.value_interp);
    if (!Number.isFinite(v) || v <= 0) continue;
    const t = Date.parse(String(p.time_measurement_end ?? ''));
    const simplified = simplifyPolygon(g as unknown as Polygon | MultiPolygon);
    const ring = simplified.type === 'Polygon' ? simplified.coordinates[0] : simplified.coordinates[0]?.[0];
    const geom = (ring && ring.length > 4) ? { type: 'Polygon' as const, coordinates: [convexHull(ring)] } : simplified;
    out.push({
      type: 'Feature',
      geometry: geom,
      properties: { id: `bfs-voronoi:${p.id ?? out.length}`, v: Math.round(v * 1000) / 1000, t: Number.isFinite(t) ? t : 0 },
    });
  }
  return { type: 'FeatureCollection', features: out };
}

export type TrackProps = {
  id: string;
  source: string;
  credits?: string;
  created_at: string;
  t: number;
  count?: number;
  min?: number;
  max?: number;
  avg?: number;
};

export type TrackCollection = FeatureCollection<LineString, TrackProps>;

const numOrNull = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function basenameOfSource(src: unknown): string {
  if (typeof src === 'string') return src.split('/').pop() || src;
  const url = (src as { url?: unknown } | null)?.url;
  if (typeof url === 'string') return url.split('/').pop() || url;
  return '';
}

function nmeaToDeg(raw: unknown, hemi: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  const deg = Math.floor(v / 100);
  const min = v - deg * 100;
  const d = deg + min / 60;
  if (hemi === 'S' || hemi === 'W' || hemi === 's' || hemi === 'w') return -d;
  return d;
}

interface CompactTrack {
  id?: unknown;
  source?: unknown;
  url?: unknown;
  filename?: unknown;
  name?: unknown;
  credits?: unknown;
  created_at?: unknown;
  created?: unknown;
  n?: unknown;
  count?: unknown;
  measurements_count?: unknown;
  min?: unknown;
  max?: unknown;
  avg?: unknown;
  average?: unknown;
  coords?: unknown;
  points?: unknown;
  measurements?: unknown;
  log?: unknown;
  geometry?: unknown;
}

function pointsToCoordsAndCpm(tr: CompactTrack): { coords: [number, number][]; cpms: number[] } {
  const coords: [number, number][] = [];
  const cpms: number[] = [];
  const rawPts = Array.isArray(tr.points) ? tr.points : Array.isArray(tr.measurements) ? tr.measurements : null;
  if (rawPts) {
    for (const pt of rawPts) {
      if (Array.isArray(pt)) {
        let lat: number, lon: number, cpm: number | undefined;
        if (pt.length >= 3 && Number.isFinite(Number(pt[0])) && Math.abs(Number(pt[0])) <= 90 && Math.abs(Number(pt[1])) <= 180) {
          lat = Number(pt[0]); lon = Number(pt[1]); cpm = Number(pt[2]);
        } else if (pt.length >= 3) {
          lon = Number(pt[0]); lat = Number(pt[1]); cpm = Number(pt[2]);
        } else {
          continue;
        }
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        coords.push([lon, lat]);
        if (Number.isFinite(cpm as number)) cpms.push(cpm as number);
        continue;
      }
      if (pt && typeof pt === 'object') {
        const o = pt as Record<string, unknown>;
        const lat = Number(o.lat ?? o.latitude);
        const lon = Number(o.lon ?? o.longitude ?? o.lng);
        const cpm = Number(o.cpm ?? o.value ?? o.v);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        coords.push([lon, lat]);
        if (Number.isFinite(cpm)) cpms.push(cpm);
      }
    }
    return { coords, cpms };
  }
  if (typeof tr.points === 'string' || typeof tr.log === 'string') {
    const text = String(tr.points ?? tr.log);
    for (const line of text.split(/\r?\n/)) {
      const s = line.trim();
      if (!s.startsWith('$')) continue;
      const star = s.indexOf('*');
      const body = star >= 0 ? s.slice(0, star) : s;
      const f = body.split(',');
      if (f.length < 11) continue;
      const cpm = Number(f[3]);
      const lat = nmeaToDeg(f[7], f[8]);
      const lon = nmeaToDeg(f[9], f[10]);
      if (!Number.isFinite(cpm) || cpm < 0 || lat == null || lon == null) continue;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      coords.push([lon, lat]);
      cpms.push(cpm);
    }
  }
  return { coords, cpms };
}

function toUsVh(cpm: number): number {
  return Math.round((cpm / 334) * 10000) / 10000;
}

export function safecastTrack(raw: unknown): TrackCollection {
  const out: Feature<LineString, TrackProps>[] = [];

  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.tracks)) list = o.tracks;
    else if (Array.isArray(o.t)) list = o.t;
    else if (Array.isArray(o.imports)) list = o.imports;
    else if (Array.isArray(o.data)) list = o.data;
    else if (o.points || o.coords || o.geometry || o.id != null || o.created_at || o.created) list = [o];
  }

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const tr = item as CompactTrack;
    let coords: [number, number][] = [];
    let cpms: number[] = [];
    if (Array.isArray(tr.coords)) {
      for (const c of tr.coords) {
        if (Array.isArray(c) && c.length >= 2 && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]))) {
          coords.push([Number(c[0]), Number(c[1])]);
        }
      }
    } else {
      const r = pointsToCoordsAndCpm(tr);
      coords = r.coords;
      cpms = r.cpms;
    }
    if (coords.length === 0) {
      const r = pointsToCoordsAndCpm(tr);
      coords = r.coords;
      cpms = r.cpms;
    }
    if (coords.length === 0 && tr.geometry && typeof tr.geometry === 'object') {
      const g = tr.geometry as { type?: string; coordinates?: unknown };
      if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
        for (const c of g.coordinates) {
          if (Array.isArray(c) && c.length >= 2) coords.push([Number(c[0]), Number(c[1])]);
        }
      }
    }
    if (coords.length < 2) continue;

    const created = String(tr.created_at ?? tr.created ?? '');
    const t = created ? Date.parse(created) || 0 : 0;
    const source = basenameOfSource(tr.source ?? tr.url ?? tr.filename ?? tr.name);

    let min = numOrNull(tr.min);
    let max = numOrNull(tr.max);
    let avg = numOrNull(tr.avg ?? tr.average);
    if ((min === undefined || max === undefined || avg === undefined) && cpms.length) {
      const vals = cpms.map(toUsVh);
      if (min === undefined) min = Math.min(...vals);
      if (max === undefined) max = Math.max(...vals);
      if (avg === undefined) avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    const count = numOrNull(tr.n ?? tr.count ?? tr.measurements_count);

    out.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {
        id: `safecast-track:${tr.id ?? out.length}`,
        source: source || `bgeigie #${tr.id ?? out.length}`,
        credits: typeof tr.credits === 'string' ? tr.credits : tr.credits == null ? undefined : String(tr.credits),
        created_at: created,
        t: Number.isFinite(t) ? t : 0,
        count: count === undefined ? undefined : Math.round(count),
        min,
        max,
        avg,
      },
    });
  }
  return { type: 'FeatureCollection', features: out };
}

export const safecastBgeigie = safecastTrack;
export const safecastTracks = safecastTrack;
