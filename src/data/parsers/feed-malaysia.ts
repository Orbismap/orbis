// data.gov.my GTFS-Realtime (Malaysia): KTM Komuter/intercity and Prasarana Rapid buses. CORS enabled. The base URLs
// redirect to the version with a trailing slash, so the slash is written out.
import type { VehicleFeed } from './vehicles';
import { getBuffer, rtFixes, settleAll } from './feedutil';

const SRC = 'KTM & Rapid (Malaysia)';
const BASE = 'https://api.data.gov.my/gtfs-realtime/vehicle-position';
export const malaysiaFeed: VehicleFeed = {
  id: 'malaysia', label: SRC, bbox: [99.5, 1.2, 104.5, 6.8], every: 30_000, covers: ['my-'],
  load: ({ signal }) =>
    settleAll([
      getBuffer(`${BASE}/ktmb/`, signal).then((b) => rtFixes(b, SRC, (v) => ({ kind: 'regio', line: v.routeId ?? v.label ?? 'KTM', op: 'KTM' }))),
      ...['rapid-bus-kl', 'rapid-bus-mrtfeeder', 'rapid-bus-penang'].map((c) =>
        getBuffer(`${BASE}/prasarana/?category=${c}`, signal).then((b) => rtFixes(b, SRC, (v) => ({ kind: 'bus', line: v.routeId ?? v.label ?? '', op: 'Rapid' }))),
      ),
    ]),
};
