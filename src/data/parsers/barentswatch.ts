// BarentsWatch live AIS (Norwegian Coastal Administration, NLOD 2.0): `v1/latest/combined?modelType=Full`, mirrored by the
// central loop of Orbismap/data to orbis-live as ais/barentswatch-latest.json. One record per MMSI with the newest position
// AND the static data (AisComboFull): mmsi, msgtime, latitude, longitude, speedOverGround (kn, 102.3 = n/a),
// courseOverGround (360 = n/a), trueHeading (511 = n/a), navigationalStatus, name, shipType, shipLength/shipWidth (m),
// dimensionA-D, draught (dm), destination, eta, imoNumber, callSign.
import type { TrackObject } from '../../render/tracks';
import { KN, shipClass, type ShipEta, type ShipProps, type ShipVessel } from './ais';

export type NorwayAis = { tracks: TrackObject[]; vessels: Record<string, ShipVessel> };

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The ETA as BarentsWatch writes it (an ISO date-time; month and day 0 = not available) -> month/day/hour/minute (UTC). */
export function barentswatchEta(v: unknown): ShipEta | null {
  const s = str(v);
  const m = /^\d{4}-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  const [month, day, hour, minute] = m.slice(1).map(Number) as [number, number, number, number];
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour < 24 && minute < 60 ? { month, day, hour, minute } : null;
}

export function barentswatchLatest(raw: unknown): NorwayAis {
  const out: NorwayAis = { tracks: [], vessels: {} };
  if (!Array.isArray(raw)) return out;
  for (const r of raw as Record<string, unknown>[]) {
    const mmsi = num(r?.mmsi);
    const lat = num(r?.latitude);
    const lng = num(r?.longitude);
    const t = Date.parse(str(r?.msgtime));
    if (!mmsi || lat === undefined || lng === undefined || Number.isNaN(t) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const sogRaw = num(r.speedOverGround);
    const sog = sogRaw !== undefined && sogRaw >= 0 && sogRaw < 102 ? sogRaw : 0;
    const cogRaw = num(r.courseOverGround);
    const cog = cogRaw !== undefined && cogRaw >= 0 && cogRaw < 360 ? cogRaw : -1;
    const hdgRaw = num(r.trueHeading);
    const hdg = hdgRaw !== undefined && hdgRaw >= 0 && hdgRaw < 360 ? hdgRaw : -1;
    const moving = sog >= 0.5;
    const heading = moving && cog >= 0 ? cog : hdg >= 0 ? hdg : cog >= 0 ? cog : undefined; // undefined: the layer fills it in
    const type = num(r.shipType) ?? 0;
    const name = str(r.name);
    const id = String(mmsi);
    out.tracks.push({
      id, lng, lat, heading, speed: moving && heading !== undefined ? sog * KN : 0, t,
      props: { mmsi, sog, cog, hdg, nav: num(r.navigationalStatus) ?? 15, moving, cls: shipClass(type), name } satisfies ShipProps & { cls: string; name: string },
    });
    const dims = (num(r.dimensionA) ?? 0) + (num(r.dimensionB) ?? 0);
    const beam = (num(r.dimensionC) ?? 0) + (num(r.dimensionD) ?? 0);
    const draught = num(r.draught) ?? 0;
    out.vessels[id] = {
      name,
      type,
      dest: str(r.destination),
      draught: draught > 0 && draught < 255 ? draught / 10 : 0,
      call: str(r.callSign),
      imo: num(r.imoNumber) ?? 0,
      len: num(r.shipLength) || dims,
      wid: num(r.shipWidth) || beam,
      eta: barentswatchEta(r.eta),
    };
  }
  return out;
}
