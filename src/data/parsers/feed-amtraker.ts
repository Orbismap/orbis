// Amtraker (Amtrak GPS, USA/Canada): one request delivers every train. CORS enabled.
import type { VehicleFeed, VehicleFix } from './vehicles';
import { getJson, toNum } from './feedutil';

const SRC = 'Amtraker (USA)';
const COMPASS: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
interface T { routeName: string; trainNum: string | number; trainID?: string; lat: number; lon: number; heading?: string; velocity?: number; origName?: string; destName?: string; trainState?: string; trainTimely?: string; updatedAt?: string; stations?: { name: string; code: string; status?: string; arr?: string; schArr?: string }[] }

export function amtrakFixes(raw: Record<string, T[]>): VehicleFix[] {
  const out: VehicleFix[] = [];
  for (const list of Object.values(raw ?? {})) {
    for (const t of Array.isArray(list) ? list : []) {
      if (t.lat == null || t.lon == null || (t.trainState && t.trainState !== 'Active')) continue;
      const ns = t.stations?.find((s) => s.status === 'Enroute' || s.status === 'Station');
      const late = ns?.arr && ns.schArr ? Math.round((Date.parse(ns.arr) - Date.parse(ns.schArr)) / 60_000) : undefined;
      out.push({
        id: `amtrak:${t.trainID ?? t.trainNum}`, lng: t.lon, lat: t.lat, heading: COMPASS[t.heading ?? ''], speed: t.velocity != null ? (toNum(t.velocity) ?? 0) * 0.44704 : undefined,
        t: Date.parse(t.updatedAt ?? '') || Date.now(), kind: 'fern', line: `${t.routeName} ${t.trainNum}`, op: 'Amtrak', from: t.origName, to: t.destName, next: ns?.name,
        delay: late !== undefined && Number.isFinite(late) ? late : undefined, src: SRC,
      });
    }
  }
  return out;
}
export const amtrakerFeed: VehicleFeed = {
  id: 'amtraker', label: SRC, bbox: [-170, 15, -50, 72], every: 30_000, covers: ['us-amtrak'],
  load: async ({ signal }) => amtrakFixes(await getJson<Record<string, T[]>>('https://api-v3.amtraker.com/v3/trains', signal, undefined, 30_000)),
};
