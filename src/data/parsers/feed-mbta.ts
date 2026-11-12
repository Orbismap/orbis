// MBTA (Boston): JSON:API with CORS. Route type 0 tram/light rail, 1 subway, 2 commuter rail, 3 bus, 4 ferry.
import type { VehicleFeed, VehicleFix, VehicleKind } from './vehicles';
import { getJson, toNum } from './feedutil';

const SRC = 'MBTA (Boston)';
const KIND: VehicleKind[] = ['tram', 'ubahn', 'regio', 'bus', 'faehre'];
const URL = 'https://api-v3.mbta.com/vehicles?include=route&fields[vehicle]=latitude,longitude,bearing,label,speed,updated_at,current_status&fields[route]=short_name,long_name,type';

interface Raw {
  data?: { id: string; attributes: { latitude: number; longitude: number; bearing?: number | null; label?: string; speed?: number | null; updated_at?: string }; relationships?: { route?: { data?: { id: string } | null } } }[];
  included?: { id: string; attributes: { short_name?: string; long_name?: string; type: number } }[];
}

export function mbtaFixes(raw: Raw): VehicleFix[] {
  const routes = new Map((raw.included ?? []).map((r) => [r.id, r.attributes]));
  const out: VehicleFix[] = [];
  for (const v of raw.data ?? []) {
    const a = v.attributes;
    if (!Number.isFinite(a.latitude) || !Number.isFinite(a.longitude)) continue;
    const r = routes.get(v.relationships?.route?.data?.id ?? '');
    out.push({
      id: `mbta:${v.id}`, lng: a.longitude, lat: a.latitude, heading: toNum(a.bearing), speed: toNum(a.speed),
      t: Date.parse(a.updated_at ?? '') || Date.now(), kind: KIND[r?.type ?? 3] ?? 'bus',
      line: r?.short_name || r?.long_name || a.label || '', op: 'MBTA', to: r?.long_name, src: SRC,
    });
  }
  return out;
}

export const mbtaFeed: VehicleFeed = {
  id: 'mbta', label: SRC, bbox: [-71.9, 41.6, -70.5, 43.0], every: 30_000,
  load: async ({ signal }) => mbtaFixes(await getJson<Raw>(URL, signal)),
};
