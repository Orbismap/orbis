// Indoor plan from OpenStreetMap Simple Indoor Tagging: rooms, corridors, walls, doors, stairs, elevators,
// plus shops and amenities located inside buildings. Parsed from an Overpass `out geom` response.
import type { Feature, LineString, Point, Polygon } from 'geojson';

export type IndoorKind =
  | 'room' | 'corridor' | 'area' | 'wall' | 'door' | 'stairs' | 'elevator'
  | 'shop' | 'amenity' | 'poi';

export interface IndoorProps {
  id: string;
  kind: IndoorKind;
  level: string;
  name: string;
  ref: string;
  category: string;   // shop value or amenity value
  osmId: string;
}

export type IndoorFeature = Feature<Point | LineString | Polygon, IndoorProps>;

type OsmEl = { type: string; id: number; lat?: number; lon?: number; geometry?: { lat: number; lon: number }[]; tags?: Record<string, string> };

const AREA_KINDS = new Set<IndoorKind>(['room', 'corridor', 'area', 'shop', 'amenity', 'poi', 'stairs', 'elevator']);

function numToken(s: string | undefined): string {
  if (!s) return '';
  const m = String(s).match(/-?\d+/);
  return m ? m[0] : String(s).trim();
}

function levelOf(tags: Record<string, string>): string {
  return numToken(tags.level ?? tags['building:level'] ?? tags['level:ref']);
}

function kindOf(tags: Record<string, string>): IndoorKind | null {
  const indoor = (tags.indoor ?? '').toLowerCase();
  if (indoor) {
    if (indoor === 'room') return 'room';
    if (indoor === 'corridor' || indoor === 'hallway' || indoor === 'passage' || indoor === 'walkway') return 'corridor';
    if (indoor === 'wall') return 'wall';
    if (indoor === 'door') return 'door';
    if (indoor === 'stairs' || indoor === 'staircase' || indoor === 'step') return 'stairs';
    if (indoor === 'elevator' || indoor === 'lift') return 'elevator';
    if (indoor === 'area' || indoor === 'yes') return 'area';
    return 'area';
  }
  if (tags.shop) return 'shop';
  if (tags.amenity) return 'amenity';
  if (tags.tourism || tags.leisure) return 'poi';
  if (tags['building:part']) return 'area';
  return null;
}

function centroid(coords: number[][]): [number, number] {
  const n = coords.length;
  if (!n) return [0, 0];
  let sx = 0, sy = 0;
  for (const c of coords) { sx += c[0]!; sy += c[1]!; }
  return [sx / n, sy / n];
}

function closed(g: { lat: number; lon: number }[]): boolean {
  return g.length >= 4 && g[0]!.lat === g[g.length - 1]!.lat && g[0]!.lon === g[g.length - 1]!.lon;
}

export function indoorOverpassQuery(b: { west: number; south: number; east: number; north: number }): string {
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:40];(
    way["indoor"](${bbox});
    node["indoor"](${bbox});
    way["level"]["shop"](${bbox});
    node["level"]["shop"](${bbox});
    way["level"]["amenity"](${bbox});
    node["level"]["amenity"](${bbox});
    way["level"]["tourism"](${bbox});
    node["level"]["tourism"](${bbox});
    way["level"]["building:part"](${bbox});
  );out geom qt;`;
}

export function indoorPlanFromOverpass(raw: unknown): IndoorFeature[] {
  const els = ((raw as { elements?: OsmEl[] } | null)?.elements ?? []) as OsmEl[];
  const out: IndoorFeature[] = [];
  for (const el of els) {
    const tags = el.tags;
    if (!tags) continue;
    const kind = kindOf(tags);
    if (!kind) continue;
    // skip pure level-tagged elements without indoor/POI semantics
    const hasSemantics = !!(tags.indoor || tags.shop || tags.amenity || tags.tourism || tags.leisure || tags['building:part']);
    if (!hasSemantics) continue;

    const level = levelOf(tags);
    const id = `${el.type[0]}${el.id}`;
    const base: IndoorProps = {
      id,
      kind,
      level,
      name: tags.name ?? tags['name:de'] ?? '',
      ref: tags.ref ?? tags['ref:INDOOR'] ?? '',
      category: tags.shop ?? tags.amenity ?? tags.tourism ?? tags.leisure ?? '',
      osmId: `${el.type}/${el.id}`,
    };

    if (el.type === 'node') {
      if (el.lat === undefined || el.lon === undefined) continue;
      out.push({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [el.lon, el.lat] }, properties: base });
      continue;
    }
    const g = el.geometry;
    if (el.type !== 'way' || !g || g.length < 2) continue;
    const coords = g.map((p) => [p.lon, p.lat]);

    if (kind === 'wall' || kind === 'door') {
      // walls/doors as lines (even when closed)
      out.push({ type: 'Feature', id, geometry: { type: 'LineString', coordinates: coords }, properties: base });
      continue;
    }

    if (closed(g) && AREA_KINDS.has(kind)) {
      out.push({ type: 'Feature', id, geometry: { type: 'Polygon', coordinates: [coords] }, properties: base });
      // POI centroid for shops/amenities/rooms with a name, to anchor a label
      if (kind === 'shop' || kind === 'amenity' || kind === 'poi' || kind === 'stairs' || kind === 'elevator') {
        const c = centroid(coords.slice(0, -1));
        out.push({ type: 'Feature', id: `${id}-pt`, geometry: { type: 'Point', coordinates: c }, properties: { ...base, kind: (kind === 'shop' ? 'shop' : kind === 'amenity' ? 'amenity' : kind) } });
      }
      continue;
    }

    // open ways: lines
    out.push({ type: 'Feature', id, geometry: { type: 'LineString', coordinates: coords }, properties: base });
    // point fallback for named open elements
    if (base.name && (kind === 'stairs' || kind === 'elevator')) {
      const c = centroid(coords);
      out.push({ type: 'Feature', id: `${id}-pt`, geometry: { type: 'Point', coordinates: c }, properties: base });
    }
  }
  return out;
}

/** Round fractional OSM levels (e.g. 0.7, 1.3, -1.5) to integers for a clean level list. */
export function normalizeIndoorLevels(features: IndoorFeature[]): IndoorFeature[] {
  return features.map((f) => {
    const lv = f.properties.level;
    if (lv === undefined || lv === null || lv === '') return f;
    const n = Number(lv);
    if (!Number.isFinite(n)) return f;
    const rounded = String(Math.round(n));
    if (rounded === lv) return f;
    return { ...f, properties: { ...f.properties, level: rounded } };
  });
}

export function indoorLevels(features: IndoorFeature[]): string[] {
  const s = new Set<string>();
  for (const f of features) if (f.properties.level) s.add(f.properties.level);
  // sort numerically where possible
  return [...s].sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

export function indoorByLevel(features: IndoorFeature[], level: string): IndoorFeature[] {
  if (!level) return features;
  return features.filter((f) => f.properties.level === level || !f.properties.level);
}
