// OVapi (Netherlands, nationwide GTFS-RT, no CORS -> proxy). Throttles hard: the proxy caches 25 s, we poll every 40 s.
// The feed has route ids only (no line names or modes), so everything is shown as a bus.
import { proxied } from '../endpoints';
import type { VehicleFeed } from './vehicles';
import { getBuffer, rtFixes } from './feedutil';

const SRC = 'OVapi (Niederlande)';
export const ovapiFeed: VehicleFeed = {
  id: 'ovapi', label: SRC, bbox: [3.3, 50.7, 7.3, 53.6], every: 40_000, covers: ['nl-'],
  load: async ({ signal }) => rtFixes(await getBuffer(proxied('https://gtfs.ovapi.nl/nl/vehiclePositions.pb'), signal, undefined, 40_000), SRC, () => ({ kind: 'bus', line: '', op: 'Niederlande' })),
};
