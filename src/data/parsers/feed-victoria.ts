// Transport Victoria (Melbourne / Victoria), GTFS-RT, free key (header KeyId). Only active with the "victoria" key.
import type { VehicleFeed, VehicleKind } from './vehicles';
import { getBuffer, rtFixes, settleAll } from './feedutil';

const SRC = 'Transport Victoria (Melbourne)';
const BASE = 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1';
const MODES: [string, VehicleKind, string][] = [['metro', 'sbahn', 'Metro Trains'], ['vline', 'regio', 'V/Line'], ['tram', 'tram', 'Yarra Trams'], ['bus', 'bus', 'Bus']];
export const victoriaFeed: VehicleFeed = {
  id: 'victoria', label: SRC, bbox: [140.9, -39.2, 150.0, -33.9], every: 30_000, key: 'victoria',
  load: ({ key, signal }) =>
    settleAll(MODES.map(([m, kind, op]) => getBuffer(`${BASE}/${m}/vehicle-positions`, signal, { KeyId: key ?? '' }).then((b) => rtFixes(b, SRC, (v) => ({ kind, line: v.routeId ?? '', op }))))),
};
