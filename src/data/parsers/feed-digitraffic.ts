// Fintraffic Digitraffic Rail (Finland, CC BY 4.0): GPS of every train. The feed has no heading (derived from
// consecutive fixes by the layer kit) and no category: it is estimated from the train number (the card shows the real
// category from the detail request).
import type { VehicleFeed, VehicleFix, VehicleKind } from './vehicles';
import { getJson } from './feedutil';

const SRC = 'Digitraffic (Finnland)';
export const API = 'https://rata.digitraffic.fi/api/v1';

/** Long distance 1-999, regional 1000-2999, commuter 8000-9999, rest freight / service runs. */
export const finnishKind = (num: number): VehicleKind => (num < 1000 ? 'fern' : num < 3000 ? 'regio' : num >= 8000 && num < 10000 ? 'sbahn' : 'andere');

interface Raw { trainNumber: number; departureDate: string; timestamp: string; speed: number; location?: { coordinates?: number[] } }
export function digitrafficFixes(list: Raw[]): VehicleFix[] {
  const out: VehicleFix[] = [];
  for (const r of Array.isArray(list) ? list : []) {
    const c = r.location?.coordinates;
    if (!c || c.length < 2 || typeof r.trainNumber !== 'number') continue;
    out.push({
      id: `fi:${r.departureDate}:${r.trainNumber}`, lng: c[0]!, lat: c[1]!, speed: (Number(r.speed) || 0) / 3.6, t: Date.parse(r.timestamp) || Date.now(),
      kind: finnishKind(r.trainNumber), line: String(r.trainNumber), op: 'VR', src: SRC, train: true, trip: `${r.departureDate}/${r.trainNumber}`,
    });
  }
  return out;
}
export const digitrafficFeed: VehicleFeed = {
  id: 'digitraffic', label: SRC, bbox: [19, 59.5, 32, 70.2], every: 10_000, covers: ['fi-'],
  load: async ({ signal }) => digitrafficFixes(await getJson<Raw[]>(`${API}/train-locations/latest`, signal)),
};
