// TransLink SEQ (Brisbane / South East Queensland), GTFS-RT without CORS -> proxy. Route ids look like "412-4203".
import { proxied } from '../endpoints';
import type { VehicleFeed } from './vehicles';
import { getBuffer, rtFixes } from './feedutil';

const SRC = 'TransLink (Brisbane)';
export const translinkFeed: VehicleFeed = {
  id: 'translink', label: SRC, bbox: [151.9, -28.3, 153.6, -26.3], every: 30_000, covers: ['au-translink', 'au-seq'],
  load: async ({ signal }) => rtFixes(await getBuffer(proxied('https://gtfsrt.api.translink.com.au/api/realtime/SEQ/VehiclePositions'), signal), SRC, (v) => ({ kind: 'bus', line: (v.routeId ?? '').split('-')[0] ?? '', op: 'TransLink' })),
};
