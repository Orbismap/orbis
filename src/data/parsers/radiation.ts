// Ambient gamma dose rate networks (BfS DE, STUK FI, Health Canada, Safecast) -> one slim point format in µSv/h.
import type { Feature, FeatureCollection, Point } from 'geojson';

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
  /** Safecast only: country code */
  country?: string;
};
export type DoseCollection = FeatureCollection<Point, DoseProps>;

const fc = (features: Feature<Point, DoseProps>[]): DoseCollection => ({ type: 'FeatureCollection', features });
const pt = (lon: number, lat: number, properties: DoseProps): Feature<Point, DoseProps> => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties });

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
