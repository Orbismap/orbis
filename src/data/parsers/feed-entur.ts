// Entur (Norway): GraphQL with bounding box and CORS. Needs a client name header.
import type { BBox } from '../../core/geo';
import type { VehicleFeed, VehicleFix, VehicleKind } from './vehicles';
import { toNum } from './feedutil';

const SRC = 'Entur (Norwegen)';
const KIND: Record<string, VehicleKind> = { RAIL: 'regio', BUS: 'bus', TRAM: 'tram', METRO: 'ubahn', COACH: 'bus', WATER: 'faehre', FERRY: 'faehre', AIR: 'andere', CABLEWAY: 'andere', FUNICULAR: 'tram', LIFT: 'andere' };

interface Raw {
  data?: { vehicles?: { mode: string; bearing?: number | null; delay?: number | null; speed?: number | null; originName?: string | null; destinationName?: string | null; vehicleId?: string; lastUpdated?: string; line?: { publicCode?: string | null; lineName?: string | null }; location: { latitude: number; longitude: number } }[] };
}

export const enturQuery = (b: BBox) =>
  `{ vehicles(boundingBox: {minLat: ${b[1].toFixed(3)}, minLon: ${b[0].toFixed(3)}, maxLat: ${b[3].toFixed(3)}, maxLon: ${b[2].toFixed(3)}}) { mode bearing delay speed originName destinationName vehicleId lastUpdated line { publicCode lineName } location { latitude longitude } } }`;

export function enturFixes(raw: Raw): VehicleFix[] {
  const out: VehicleFix[] = [];
  for (const v of raw.data?.vehicles ?? []) {
    if (!v.location) continue;
    const delay = toNum(v.delay);
    out.push({
      id: `entur:${v.vehicleId ?? `${v.location.latitude},${v.location.longitude}`}`, lng: v.location.longitude, lat: v.location.latitude,
      heading: toNum(v.bearing), speed: toNum(v.speed), t: Date.parse(v.lastUpdated ?? '') || Date.now(),
      kind: KIND[v.mode] ?? 'andere', line: v.line?.publicCode || v.line?.lineName || '', from: v.originName ?? undefined, to: v.destinationName ?? undefined,
      delay: delay !== undefined ? Math.round(delay / 60) : undefined, src: SRC,
    });
  }
  return out;
}

export const enturFeed: VehicleFeed = {
  id: 'entur', label: SRC, bbox: [4, 57.8, 31.5, 71.5], every: 20_000, bounded: true, covers: ['no-'],
  async load({ bbox, signal }) {
    const r = await fetch('https://api.entur.io/realtime/v2/vehicles/graphql', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'ET-Client-Name': 'orbis-map' }, body: JSON.stringify({ query: enturQuery(bbox) }),
    });
    if (!r.ok) throw new Error(`Quelle meldet Fehler ${r.status}`);
    return enturFixes((await r.json()) as Raw);
  },
};
