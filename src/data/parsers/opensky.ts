// OpenSky Network `states/all?extended=1` (worldwide, ~1 MB) -> track objects in the same shape as readsb aircraft.
// State vector: [0 icao24, 1 callsign, 2 origin country, 3 time_position, 4 last_contact, 5 lon, 6 lat, 7 baro_alt m,
// 8 on_ground, 9 velocity m/s, 10 true_track, 11 vertical_rate m/s, 12 sensors, 13 geo_alt, 14 squawk, 15 spi,
// 16 position_source, 17 category].
import type { TrackObject } from '../../render/tracks';
import { countryOfHex, type AircraftProps } from './readsb';

/** OpenSky category -> ADS-B emitter category (A1 light … A7 rotorcraft …); obstacles (18-20) are dropped. */
const CATEGORY: Record<number, string> = { 2: 'A1', 3: 'A2', 4: 'A3', 5: 'A4', 6: 'A5', 7: 'A6', 8: 'A7', 9: 'B1', 10: 'B2', 11: 'B3', 12: 'B4', 14: 'B6', 15: 'B7', 16: 'C1', 17: 'C2' };

export function openskyStates(raw: unknown): TrackObject[] {
  const r = raw as { time?: number; states?: unknown[][] | null } | null;
  const states = r?.states;
  if (!Array.isArray(states)) return [];
  const now = Date.now();
  const out: TrackObject[] = [];
  for (const s of states) {
    if (!Array.isArray(s)) continue;
    const lng = s[5];
    const lat = s[6];
    if (typeof lng !== 'number' || typeof lat !== 'number') continue;
    const hex = String(s[0] ?? '').toLowerCase();
    if (!hex || /^0+$/.test(hex)) continue;
    const catCode = typeof s[17] === 'number' ? s[17] : 0;
    if (catCode >= 18 && catCode <= 20) continue;
    const gnd = s[8] === true;
    const alt = gnd || typeof s[7] !== 'number' ? 0 : Math.round(s[7]);
    const sq = typeof s[14] === 'string' ? s[14] : '';
    const cat = CATEGORY[catCode] ?? '';
    const trk = typeof s[10] === 'number' ? s[10] : undefined;
    const speed = typeof s[9] === 'number' ? s[9] : undefined;
    const tPos = typeof s[3] === 'number' ? s[3] * 1000 : typeof s[4] === 'number' ? s[4] * 1000 : now;
    const props: AircraftProps = {
      call: String(s[1] ?? '').trim(), reg: '', type: '', desc: '', hex, country: countryOfHex(hex), alt,
      vr: typeof s[11] === 'number' ? Math.round(s[11] * 10) / 10 : 0,
      sq, gnd, heli: cat === 'A7', mil: false, emerg: sq === '7500' || sq === '7600' || sq === '7700', cat, trk: trk ?? -1,
      age: Math.max(0, Math.round((now - tPos) / 1000)), nav: -1,
    };
    out.push({ id: hex, lng, lat, heading: trk, speed: gnd && (speed ?? 0) < 2 ? 0 : speed, t: tPos, props: props as unknown as Record<string, string | number | boolean> });
  }
  return out;
}

/** Snapshots older than this are not shown as the overview (the collector uploads every 90 s). */
export const SNAPSHOT_MAX_AGE = 10 * 60_000;

/** True when the newest position in the snapshot is older than `maxAge` (or there is none). Positions trail the snapshot `time` by a few seconds. */
export function snapshotStale(list: readonly TrackObject[], now: number, maxAge = SNAPSHOT_MAX_AGE): boolean {
  let newest = 0;
  for (const t of list) if (t.t > newest) newest = t.t;
  return now - newest > maxAge;
}
