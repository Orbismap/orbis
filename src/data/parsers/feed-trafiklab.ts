// Trafiklab / Samtrafiken GTFS Regional Realtime (Sweden), free key. Only active with the "trafiklab" key.
import type { VehicleFeed } from './vehicles';
import { getBuffer, rtFixes, settleAll } from './feedutil';

const SRC = 'Trafiklab (Schweden)';
const OPERATORS = ['sl', 'ul', 'skane', 'otraf', 'klt', 'orebro'];
export const trafiklabFeed: VehicleFeed = {
  id: 'trafiklab', label: SRC, bbox: [10.5, 55.2, 24.2, 69.1], every: 30_000, key: 'trafiklab',
  load: ({ key, signal }) =>
    settleAll(OPERATORS.map((op) => getBuffer(`https://opendata.samtrafiken.se/gtfs-rt/${op}/VehiclePositions.pb?key=${encodeURIComponent(key ?? '')}`, signal).then((b) => rtFixes(b, SRC, (v) => ({ kind: 'bus', line: v.routeId ?? '', op: op.toUpperCase() }))))),
};
