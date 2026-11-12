// Metro Transit (Minneapolis-St Paul), GTFS-RT with CORS. Routes 901/902 are light rail, 888 Northstar commuter rail.
import type { VehicleFeed, VehicleKind } from './vehicles';
import { getBuffer, rtFixes } from './feedutil';

const SRC = 'Metro Transit (Minneapolis)';
export const metroKind = (route = ''): VehicleKind => (/^90[12]$/.test(route) ? 'tram' : route === '888' ? 'regio' : 'bus');
export const metrotransitFeed: VehicleFeed = {
  id: 'metrotransit', label: SRC, bbox: [-93.8, 44.6, -92.8, 45.3], every: 30_000,
  load: async ({ signal }) => rtFixes(await getBuffer('https://svc.metrotransit.org/mtgtfs/vehiclepositions.pb', signal), SRC, (v) => ({ kind: metroKind(v.routeId), line: v.routeId ?? '', op: 'Metro Transit' })),
};
