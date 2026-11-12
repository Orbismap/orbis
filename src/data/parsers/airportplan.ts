// Airport ground plan from OpenStreetMap `aeroway=*`: runways, taxiways, aprons, terminals, hangars, helipads, gates and
// parking positions. Two sources feed the same structure: the prebuilt files (`<assets>/data/airports/<ICAO>.json`, 443
// airports, properties left out when default) and Overpass for all others. The properties carry what the later 3D view
// needs: `h`/`minh` (building height and base in m), `w` (width in m), `surface`.
export type PlanKind = 'runway' | 'taxiway' | 'taxilane' | 'apron' | 'terminal' | 'hangar' | 'helipad' | 'gate' | 'parking';
export type PlanPolygon = GeoJSON.Feature<GeoJSON.Polygon, { id: string; kind: PlanKind; ref: string; name: string; h: number; minh: number }>;
export type PlanLine = GeoJSON.Feature<GeoJSON.LineString, { id: string; kind: PlanKind; ref: string; name: string; w: number; surface: string }>;
export type PlanPoint = GeoJSON.Feature<GeoJSON.Point, { id: string; kind: PlanKind; ref: string; name: string }>;
export type AirportPlan = { icao: string; polygons: PlanPolygon[]; lines: PlanLine[]; points: PlanPoint[] };
export type AirportIndexEntry = { icao: string; name: string; bbox: [number, number, number, number]; iata?: string };

const DEFAULT_WIDTH: Partial<Record<PlanKind, number>> = { runway: 45, taxiway: 23, taxilane: 15 };
const DEFAULT_HEIGHT: Partial<Record<PlanKind, number>> = { terminal: 18, hangar: 14 };
const KINDS = new Set<string>(['runway', 'taxiway', 'taxilane', 'apron', 'terminal', 'hangar', 'helipad', 'gate', 'parking']);

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : NaN;
};

/** `{icao, bbox}` list of the prebuilt files. */
export function airportIndex(raw: unknown): AirportIndexEntry[] {
  const l = (raw as { airports?: AirportIndexEntry[] } | null)?.airports;
  return Array.isArray(l) ? l.filter((a) => a && typeof a.icao === 'string' && Array.isArray(a.bbox) && a.bbox.length === 4) : [];
}

/** Prebuilt file -> plan (fills the properties the files leave out). */
export function planFromStatic(raw: unknown): AirportPlan {
  const j = raw as { icao?: string; polygons?: PlanPolygon[]; lines?: PlanLine[]; points?: PlanPoint[] } | null;
  const polygons = (j?.polygons ?? []).filter((f) => KINDS.has(f.properties?.kind)).map((f) => {
    const k = f.properties.kind;
    const h = num(f.properties.h);
    return { ...f, properties: { ref: '', name: '', minh: 0, ...(f.properties as object), h: Number.isFinite(h) ? h : (DEFAULT_HEIGHT[k] ?? 0), id: String(f.id ?? f.properties.id ?? '') } } as PlanPolygon;
  });
  const lines = (j?.lines ?? []).filter((f) => KINDS.has(f.properties?.kind)).map((f) => ({
    ...f, properties: { ref: '', name: '', surface: '', ...(f.properties as object), w: Number.isFinite(num(f.properties.w)) ? num(f.properties.w) : (DEFAULT_WIDTH[f.properties.kind] ?? 20), id: String(f.id ?? f.properties.id ?? '') },
  })) as PlanLine[];
  const points = (j?.points ?? []).filter((f) => KINDS.has(f.properties?.kind)).map((f) => ({ ...f, properties: { ref: '', name: '', ...(f.properties as object), id: String(f.id ?? f.properties.id ?? '') } })) as PlanPoint[];
  return { icao: String(j?.icao ?? ''), polygons, lines, points };
}

type OsmEl = { type: string; id: number; lat?: number; lon?: number; geometry?: { lat: number; lon: number }[]; tags?: Record<string, string> };

export function overpassQuery(b: { west: number; south: number; east: number; north: number }): string {
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:35];(way["aeroway"~"^(runway|taxiway|taxilane|apron|helipad|terminal|hangar|gate|parking_position)$"](${bbox});node["aeroway"~"^(gate|parking_position|helipad)$"](${bbox}););out geom qt;`;
}

/** Overpass `out geom` elements -> plan. Relations are skipped. */
export function planFromOverpass(raw: unknown, icao = ''): AirportPlan {
  const els = ((raw as { elements?: OsmEl[] } | null)?.elements ?? []) as OsmEl[];
  const out: AirportPlan = { icao, polygons: [], lines: [], points: [] };
  for (const el of els) {
    const tags = el.tags;
    const aw = tags?.aeroway === 'parking_position' ? 'parking' : tags?.aeroway;
    if (!tags || !aw || !KINDS.has(aw)) continue;
    const kind = aw as PlanKind;
    const id = `${el.type[0]}${el.id}`;
    const base = { id, kind, ref: tags.ref ?? '', name: tags.name ?? '' };
    if (el.type === 'node') {
      if (el.lat !== undefined && el.lon !== undefined && (kind === 'gate' || kind === 'parking' || kind === 'helipad')) out.points.push({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [el.lon, el.lat] }, properties: base });
      continue;
    }
    const g = el.geometry;
    if (el.type !== 'way' || !g || g.length < 2) continue;
    const coords = g.map((p) => [p.lon, p.lat]);
    const closed = g.length >= 4 && g[0]!.lat === g[g.length - 1]!.lat && g[0]!.lon === g[g.length - 1]!.lon;
    if (closed && (kind === 'apron' || kind === 'terminal' || kind === 'hangar' || kind === 'helipad')) {
      const levels = num(tags['building:levels']);
      const h0 = num(tags.height);
      const h = Number.isFinite(h0) ? h0 : Number.isFinite(levels) ? levels * 3.5 : (DEFAULT_HEIGHT[kind] ?? 0);
      const m = num(tags.min_height);
      out.polygons.push({ type: 'Feature', id, geometry: { type: 'Polygon', coordinates: [coords] }, properties: { ...base, h, minh: Number.isFinite(m) ? m : 0 } });
    } else if (kind === 'runway' || kind === 'taxiway' || kind === 'taxilane') {
      const w = num(tags.width);
      out.lines.push({ type: 'Feature', id, geometry: { type: 'LineString', coordinates: coords }, properties: { ...base, w: Number.isFinite(w) ? w : (DEFAULT_WIDTH[kind] ?? 20), surface: tags.surface ?? '' } });
    } else if (kind === 'gate' || kind === 'parking' || kind === 'helipad') {
      const c = g.reduce<[number, number]>((a, p) => [a[0] + p.lon / g.length, a[1] + p.lat / g.length], [0, 0]);
      out.points.push({ type: 'Feature', id, geometry: { type: 'Point', coordinates: c }, properties: base });
    }
  }
  return out;
}

const bearingOf = (a: number[], b: number[]) => {
  const dx = (b[0]! - a[0]!) * Math.cos(((a[1]! + b[1]!) / 2) * Math.PI / 180);
  const dy = b[1]! - a[1]!;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
};

/** Runway numbers at both ends: "07L/25R" -> "07L" at the start, "25R" at the end; `rot` = direction of travel (text reads along it). */
export function runwayEnds(lines: PlanLine[]): GeoJSON.Feature<GeoJSON.Point, { id: string; text: string; rot: number }>[] {
  const out: GeoJSON.Feature<GeoJSON.Point, { id: string; text: string; rot: number }>[] = [];
  for (const l of lines) {
    if (l.properties.kind !== 'runway' || !l.properties.ref) continue;
    const parts = l.properties.ref.split(/[/;,]/).map((s) => s.trim()).filter(Boolean);
    const c = l.geometry.coordinates;
    if (c.length < 2 || !parts.length) continue;
    const first = c[0]!;
    const last = c[c.length - 1]!;
    // each number stands at the threshold of its own direction and reads towards the runway centre... as painted: the number sits at the end you start from
    out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: first }, properties: { id: `${l.properties.id}-a`, text: parts[0]!, rot: bearingOf(first, c[1]!) } });
    if (parts[1]) out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: last }, properties: { id: `${l.properties.id}-b`, text: parts[1], rot: bearingOf(last, c[c.length - 2]!) } });
  }
  return out;
}

/** Index entries whose box intersects the view, nearest to the centre first. */
export function airportsInView(index: AirportIndexEntry[], view: [number, number, number, number], limit = 3): AirportIndexEntry[] {
  const cx = (view[0] + view[2]) / 2;
  const cy = (view[1] + view[3]) / 2;
  return index
    .filter((a) => a.bbox[0] <= view[2] && a.bbox[2] >= view[0] && a.bbox[1] <= view[3] && a.bbox[3] >= view[1])
    .sort((a, b) => Math.hypot((a.bbox[0] + a.bbox[2]) / 2 - cx, (a.bbox[1] + a.bbox[3]) / 2 - cy) - Math.hypot((b.bbox[0] + b.bbox[2]) / 2 - cx, (b.bbox[1] + b.bbox[3]) / 2 - cy))
    .slice(0, limit);
}

/** Pixel width factor: line width in px = metres * factor at zoom z (MapLibre, 512 px tiles) at latitude `lat`. */
export const pxPerMetre = (z: number, lat: number) => (2 ** z) / (78271.517 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
