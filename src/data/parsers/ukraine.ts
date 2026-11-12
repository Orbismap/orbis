// Ukraine: Bellingcat civilian harm points (ukraine-harm.json) and the Oblast table (ukraine-oblast.json) joined to geometry.
import type { Feature, FeatureCollection, Geometry, Point } from 'geojson';

export type HarmProps = { id: string; t: number; place: string; text: string; impact: string; weapons: string; src: string; graphic: number };
export type HarmCollection = FeatureCollection<Point, HarmProps> & { built?: string };

interface RawHarm { id?: string; d?: string; l?: string; lat?: number; lon?: number; t?: string; i?: string[]; w?: string[]; s?: string[]; g?: number }

export function ukraineHarmPoints(raw: unknown): HarmCollection {
  const doc = raw as { built?: string; events?: RawHarm[] } | null;
  const features: Feature<Point, HarmProps>[] = [];
  for (const e of doc?.events ?? []) {
    if (!e.d || !Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue;
    const t = Date.parse(`${e.d}T12:00:00Z`);
    if (!Number.isFinite(t)) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.lon!, e.lat!] },
      properties: { id: e.id ?? String(features.length), t, place: e.l ?? '', text: e.t ?? '', impact: (e.i ?? []).join(', '), weapons: (e.w ?? []).join(', '), src: (e.s ?? []).join('\n'), graphic: e.g ? 1 : 0 },
    });
  }
  return { type: 'FeatureCollection', features, built: doc?.built };
}

/** Key of a region in ukraine-oblast.json: lower case name without special characters; the city of Kyiv is separate. */
export const oblastKey = (en: string, type = ''): string => (type === 'Municipality' ? 'kyivcity' : en.toLowerCase().replace(/[^a-z]/g, ''));

export interface UkRegion { ew: number; year: Record<string, number>; sector: Record<string, number>; weapon: Record<string, number>; killed: Record<string, number>; last: string; air: Record<string, number> }
export interface UkOblast { built: string; source: string; unresolved: number; regions: Record<string, UkRegion>; who: Record<string, { attacks: number; killed: number; injured: number }> }

export type OblastProps = { id: string; name: string; incidents: number; airHours: number; last: string; value: number };

/** Geometry (Natural Earth admin 1) joined with the table; `value` is the metric that colours the area. */
export function oblastCollection(geo: FeatureCollection, data: UkOblast, metric: 'incidents' | 'air'): FeatureCollection<Geometry, OblastProps> {
  const features: Feature<Geometry, OblastProps>[] = geo.features.map((f) => {
    const p = f.properties as { en: string; type: string };
    const key = oblastKey(p.en, p.type);
    const r = data.regions[key];
    const air = r ? Object.values(r.air).reduce((s, v) => s + v, 0) : 0;
    return { type: 'Feature', geometry: f.geometry, properties: { id: key, name: p.type === 'Municipality' ? 'Kiew (Stadt)' : p.en, incidents: r?.ew ?? 0, airHours: Math.round(air), last: r?.last ?? '', value: metric === 'air' ? Math.round(air) : r?.ew ?? 0 } };
  });
  return { type: 'FeatureCollection', features };
}
