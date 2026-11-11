// NWS active alerts (api.weather.gov GeoJSON) -> slim warning polygons. Zone-only alerts without geometry are dropped.
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

export type NwsProps = {
  id: string;
  /** English NWS event name, e.g. "Tornado Warning" */
  event: string;
  headline: string;
  area: string;
  description: string;
  instruction: string;
  /** ms since epoch */
  onset: number;
  expires: number;
  severity: string;
  sender: string;
  url: string;
};
export type NwsCollection = FeatureCollection<Polygon | MultiPolygon, NwsProps>;

const ms = (v: unknown): number => (typeof v === 'string' ? Date.parse(v) : NaN);
const cut = (v: unknown, n: number) => {
  const s = typeof v === 'string' ? v.replace(/\r/g, '').trim() : '';
  return s.length > n ? `${s.slice(0, n).trimEnd()} …` : s;
};

export function nwsAlerts(raw: unknown): NwsCollection {
  const features: Feature<Polygon | MultiPolygon, NwsProps>[] = [];
  const list = (raw as { features?: { id?: string; geometry?: Polygon | MultiPolygon | null; properties?: Record<string, unknown> }[] } | null)?.features;
  if (!Array.isArray(list)) return { type: 'FeatureCollection', features };
  for (const f of list) {
    const p = f.properties;
    if (!p || !f.geometry || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) continue;
    const onset = ms(p.onset ?? p.effective ?? p.sent);
    const expires = ms(p.ends ?? p.expires);
    const id = String(p.id ?? f.id ?? '');
    features.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        id,
        event: String(p.event ?? 'Alert'),
        headline: cut(p.headline, 220),
        area: cut(p.areaDesc, 240),
        description: cut(p.description, 1600),
        instruction: cut(p.instruction, 800),
        onset: Number.isFinite(onset) ? onset : 0,
        expires: Number.isFinite(expires) ? expires : 0,
        severity: String(p.severity ?? ''),
        sender: String(p.senderName ?? ''),
        url: id.startsWith('http') ? id : 'https://alerts.weather.gov/',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
