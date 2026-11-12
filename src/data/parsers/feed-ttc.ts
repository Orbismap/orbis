// TTC (Toronto) via umoiq (NextBus). CORS enabled. 500-series routes are streetcars; 1-4 are subway lines (not in feed).
import type { VehicleFeed, VehicleFix } from './vehicles';
import { getJson, toNum } from './feedutil';

const SRC = 'TTC (Toronto)';
interface V { routeTag: string; lat: string; lon: string; heading?: string; speedKmHr?: string; id?: string; secsSinceReport?: string }

export function ttcFixes(raw: { vehicle?: V[] | V }): VehicleFix[] {
  const list = Array.isArray(raw.vehicle) ? raw.vehicle : raw.vehicle ? [raw.vehicle] : [];
  const now = Date.now();
  const out: VehicleFix[] = [];
  for (const v of list) {
    const lat = toNum(v.lat), lng = toNum(v.lon);
    if (lat === undefined || lng === undefined) continue;
    const route = Number(v.routeTag);
    const kmh = toNum(v.speedKmHr);
    const heading = toNum(v.heading);
    out.push({
      id: `ttc:${v.id ?? `${v.routeTag}:${lat},${lng}`}`, lng, lat, heading: heading !== undefined && heading >= 0 ? heading : undefined,
      speed: kmh !== undefined ? kmh / 3.6 : undefined, t: now - (toNum(v.secsSinceReport) ?? 0) * 1000,
      kind: route >= 500 && route < 600 ? 'tram' : 'bus', line: v.routeTag, op: 'TTC', src: SRC,
    });
  }
  return out;
}

export const ttcFeed: VehicleFeed = {
  id: 'ttc', label: SRC, bbox: [-79.7, 43.5, -79.0, 43.95], every: 30_000,
  load: async ({ signal }) => ttcFixes(await getJson(`https://retro.umoiq.com/service/publicJSONFeed?command=vehicleLocations&a=ttc&t=0`, signal)),
};
