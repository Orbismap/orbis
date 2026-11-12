// Road markings mapped in OpenStreetMap (Overpass `out body geom`): zebra crossings, marked crossings, explicit line
// markings (road_marking), no-overtaking lines and traffic islands.
import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson';

export type MarkKind = 'zebra' | 'cross' | 'marking' | 'over' | 'island';
export type MarkProps = { id: string; kind: MarkKind; dash: boolean; title: string; marking: string; url: string };

export const roadmarkQuery = (s: number, w: number, n: number, e: number): string => {
  const bb = `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;
  return `[out:json][timeout:40];(way["crossing"~"^(zebra|marked|lines|dash|dash_left|dash_right|dots|bar)$"](${bb});way["crossing:markings"](${bb});way["road_marking"](${bb});way["highway"]["overtaking"~"^(no|reverse|opposite)$"](${bb});way["traffic_island"](${bb}););out body geom 8000;`;
};

const ZEBRA = /zebra|bar/;
type El = { type: string; id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };

export function overpassRoadmarks(raw: unknown): FeatureCollection<LineString | Polygon, MarkProps> {
  const els = ((raw as { elements?: El[] } | null)?.elements ?? []) as El[];
  const features: Feature<LineString | Polygon, MarkProps>[] = [];
  for (const el of els) {
    const t = el.tags ?? {};
    if (!el.geometry || el.geometry.length < 2) continue;
    const coords = el.geometry.map((p) => [p.lon, p.lat] as [number, number]);
    const last = coords[coords.length - 1]!;
    const closed = coords.length >= 4 && coords[0]![0] === last[0] && coords[0]![1] === last[1];
    let kind: MarkKind;
    let dash = false;
    let title: string;
    if (ZEBRA.test(t['crossing:markings'] ?? t.crossing ?? '')) { kind = 'zebra'; title = 'Zebrastreifen'; }
    else if (t.crossing || t['crossing:markings']) { kind = 'cross'; dash = true; title = 'Markierte Querungsanlage'; }
    else if (t.road_marking) { kind = 'marking'; dash = /dash|broken/i.test(t['road_marking:stroke'] ?? t.road_marking); title = 'Bodenmarkierung'; }
    else if (t.overtaking) { kind = 'over'; title = 'Überholverbot'; }
    else { kind = 'island'; title = 'Verkehrsinsel'; }
    features.push({
      type: 'Feature',
      geometry: closed && kind === 'island' ? { type: 'Polygon', coordinates: [coords] } : { type: 'LineString', coordinates: coords },
      properties: { id: `w${el.id}`, kind, dash, title, marking: t.road_marking ?? '', url: `https://www.openstreetmap.org/${el.type}/${el.id}` },
    });
  }
  return { type: 'FeatureCollection', features };
}
