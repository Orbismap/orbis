// SEPTA Regional Rail (Philadelphia). No CORS -> proxy.
import { proxied } from '../endpoints';
import type { VehicleFeed, VehicleFix } from './vehicles';
import { getJson, toNum } from './feedutil';

const SRC = 'SEPTA (Philadelphia)';
interface Raw { lat: string; lon: string; trainno: string; line?: string; dest?: string; SOURCE?: string; late?: number; heading?: string | number; nextstop?: string }

export function septaFixes(list: Raw[]): VehicleFix[] {
  const out: VehicleFix[] = [];
  for (const t of Array.isArray(list) ? list : []) {
    const lat = toNum(t.lat), lng = toNum(t.lon);
    if (lat === undefined || lng === undefined) continue;
    out.push({
      id: `septa:${t.trainno}`, lng, lat, heading: toNum(t.heading), t: Date.now(), kind: 'regio',
      line: `${t.line ?? 'Regional Rail'} ${t.trainno}`, op: 'SEPTA', from: t.SOURCE, to: t.dest, next: t.nextstop || undefined, delay: toNum(t.late), src: SRC,
    });
  }
  return out;
}

export const septaFeed: VehicleFeed = {
  id: 'septa', label: SRC, bbox: [-76.2, 39.5, -74.6, 40.5], every: 30_000,
  load: async ({ signal }) => septaFixes(await getJson<Raw[]>(proxied('https://www3.septa.org/api/TrainView/index.php'), signal)),
};
