// HSL (Helsinki region), GTFS-RT without CORS -> proxy. Route ids carry the mode: 31M* metro, 300* commuter rail,
// 1001-1010 trams, 1019 Suomenlinna ferry, everything else bus. The line shown is the route id without the area prefix.
import { proxied } from '../endpoints';
import type { VehicleFeed, VehicleKind } from './vehicles';
import { getBuffer, rtFixes } from './feedutil';

const SRC = 'HSL (Helsinki)';
export function hslKind(route = ''): { kind: VehicleKind; line: string } {
  if (/^31M/.test(route)) return { kind: 'ubahn', line: route.replace(/^31/, '') };
  if (/^300\d/.test(route)) return { kind: 'sbahn', line: route.replace(/^300/, '').replace(/^0+/, '') || route };
  if (/^10(0[1-9]|10)$/.test(route)) return { kind: 'tram', line: String(Number(route.slice(2))) };
  if (route === '1019') return { kind: 'faehre', line: 'Suomenlinna' };
  return { kind: 'bus', line: route.replace(/^[1-9]0*/, '') || route };
}

export const hslFeed: VehicleFeed = {
  id: 'hsl', label: SRC, bbox: [24.4, 59.9, 25.6, 60.5], every: 20_000, covers: ['fi-hsl', 'fi-'],
  load: async ({ signal }) => rtFixes(await getBuffer(proxied('https://realtime.hsl.fi/realtime/vehicle-positions/v2/hsl'), signal), SRC, (v) => ({ ...hslKind(v.routeId), op: 'HSL', trip: undefined })),
};
