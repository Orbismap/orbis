// Mobile speed checks reported by the blitzer.de community (unofficial map endpoint, through the proxy):
// GET https://www.blitzer.de/karte/api/markers?type=<codes>&box=<south,west,north,east>&z=18 -> { pois: Marker[] | null }.
// Large boxes get server side clustered summary markers (type 1000, no id) that are skipped; stationary cameras
// (`info.fixed`) are skipped as well, the OpenStreetMap set covers them.
import type { Feature, FeatureCollection, Point } from 'geojson';

/** Mobile / trailer mounted control codes (speed, red light, section, distance, weight …). */
export const MOBILE_TYPE_CODES = ['1', '7', '201', '2', '11', '110', '12', '113', '6', '101', '3', '117', '4', '5'];
export const blitzerdeUrl = (s: number, w: number, n: number, e: number) =>
  `https://www.blitzer.de/karte/api/markers?type=${MOBILE_TYPE_CODES.join(',')}&box=${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}&z=18`;

export type MobileProps = { id: string; kind: 'mobile'; dir: number; title: string; where: string; speed: number; votes: number; reported: number; desc: string };

interface Marker {
  id?: string | number; lat?: number | string; lng?: number | string; type?: string | number; vmax?: string | number; counter?: number;
  address?: { city?: string; street?: string };
  info?: { fixed?: string | number; partly_fixed?: string | number; kind?: string; desc?: string };
  create_date?: string; confirm_date?: string;
}

export function blitzerdeMarkers(raw: unknown): FeatureCollection<Point, MobileProps> {
  const pois = ((raw as { pois?: Marker[] | null } | null)?.pois ?? []) as Marker[];
  const features: Feature<Point, MobileProps>[] = [];
  for (const m of pois) {
    if (!m.id) continue;
    const lat = Number(m.lat), lng = Number(m.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (String(m.info?.fixed ?? '') === '1' || String(m.info?.partly_fixed ?? '') === '1') continue;
    const a = m.address ?? {};
    const speed = Number(m.vmax);
    features.push({
      type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        id: `m${m.id}`, kind: 'mobile', dir: -1, title: m.info?.kind || 'Mobile Kontrolle', where: [a.street, a.city].filter(Boolean).join(', '),
        speed: Number.isFinite(speed) && speed > 0 ? speed : -1, votes: m.counter ?? 0, reported: Date.parse(m.confirm_date || m.create_date || '') || 0, desc: m.info?.desc ?? '',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
