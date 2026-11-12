// Overpass answer for public transport route relations (`out body geom` + stop nodes) -> lines and stops.
// Query: bus, trolleybus, tram, subway, light rail and ferry routes inside a box, with their stops.
import type { Feature, FeatureCollection, MultiLineString, Point } from 'geojson';

export const ROUTE_STYLE: Record<string, { label: string; color: string; order: number }> = {
  subway: { label: 'U-Bahn', color: '#4a90ff', order: 5 },
  light_rail: { label: 'Stadtbahn', color: '#19b7a0', order: 4 },
  tram: { label: 'Tram', color: '#ff55a8', order: 3 },
  trolleybus: { label: 'O-Bus', color: '#d080ff', order: 2 },
  bus: { label: 'Bus', color: '#b57bff', order: 1 },
  ferry: { label: 'Fähre', color: '#3fc4f5', order: 0 },
};

export const oepnvQuery = (s: number, w: number, n: number, e: number): string => {
  const bb = `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;
  // `out tags` prints no coordinates and `out geom tags` drops the relation members: `out body geom` is required
  return `[out:json][timeout:40];(relation["type"="route"]["route"~"^(bus|trolleybus|tram|subway|light_rail|ferry)$"](${bb});)->.r;.r out body geom;node(r.r:"stop")(${bb});out body 4000;`;
};

export type LineProps = { id: string; ref: string; name: string; mode: string; modeLabel: string; color: string; order: number; from: string; to: string; operator: string; url: string };
export type StopProps = { id: string; name: string; url: string };
export type OepnvResult = { lines: FeatureCollection<MultiLineString, LineProps>; stops: FeatureCollection<Point, StopProps> };

type El = { type: string; id: number; lat?: number; lon?: number; tags?: Record<string, string>; members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[] };

const validColor = (c?: string) => (c && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c) ? (c.startsWith('#') ? c : `#${c}`) : undefined);

export function overpassRoutes(raw: unknown): OepnvResult {
  const els = ((raw as { elements?: El[] } | null)?.elements ?? []) as El[];
  const lines: Feature<MultiLineString, LineProps>[] = [];
  const stops: Feature<Point, StopProps>[] = [];
  const seenStops = new Set<string>();
  for (const el of els) {
    const t = el.tags ?? {};
    if (el.type === 'relation') {
      const mode = t.route ?? 'bus';
      const st = ROUTE_STYLE[mode] ?? ROUTE_STYLE.bus!;
      const coords = (el.members ?? [])
        .filter((m) => m.type === 'way' && m.geometry && m.geometry.length > 1 && !/platform|stop/.test(m.role))
        .map((m) => m.geometry!.map((p) => [p.lon, p.lat]));
      if (!coords.length) continue;
      lines.push({
        type: 'Feature', geometry: { type: 'MultiLineString', coordinates: coords },
        properties: {
          id: `r${el.id}`, ref: t.ref ?? '', name: t.name ?? '', mode, modeLabel: st.label, color: validColor(t.colour) ?? st.color, order: st.order,
          from: t.from ?? '', to: t.to ?? '', operator: t.operator ?? t.network ?? '', url: `https://www.openstreetmap.org/relation/${el.id}`,
        },
      });
    } else if (el.type === 'node' && el.lat != null && el.lon != null) {
      const name = t.name ?? '';
      // both directions share a name: one marker per name and rough position
      const key = `${name}|${el.lat.toFixed(3)}|${el.lon.toFixed(3)}`;
      if (seenStops.has(key)) continue;
      seenStops.add(key);
      stops.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [el.lon, el.lat] }, properties: { id: `n${el.id}`, name, url: `https://www.openstreetmap.org/node/${el.id}` } });
    }
  }
  lines.sort((a, z) => a.properties.order - z.properties.order);
  return { lines: { type: 'FeatureCollection', features: lines }, stops: { type: 'FeatureCollection', features: stops } };
}
