// GNSS interference (jamming/spoofing) estimated from the navigation quality that aircraft report in ADS-B (NIC/NACp,
// readsb `gpsOkBefore`). Aircraft are tallied per 0.5° cell over a rolling 30 min window, so panning around fills the
// map. Cell formula and bands after gpsjam.org: the first bad aircraft is discounted, then < 2 % low, 2–10 % medium,
// > 10 % high. Low values can also come from faulty avionics: an indication, no proof.
import type { TrackObject } from '../../render/tracks';
import type { AircraftProps } from './readsb';

export const CELL_DEG = 0.5;
export const WINDOW_MS = 30 * 60_000;
/** cells with fewer aircraft are not shown */
export const MIN_AIRCRAFT = 3;
export type GnssLevel = 'low' | 'medium' | 'high';
export type GnssCell = { id: string; w: number; s: number; n: number; bad: number; pct: number; level: GnssLevel };

export const levelOf = (pct: number): GnssLevel => (pct > 10 ? 'high' : pct >= 2 ? 'medium' : 'low');
const cellOf = (lng: number, lat: number) => `${Math.floor(lat / CELL_DEG)}:${Math.floor(lng / CELL_DEG)}`;

export class GnssStore {
  private obs = new Map<string, { cell: string; seenAt: number; badAt: number | null }>();

  /** Takes one load of aircraft; returns the aircraft that report bad navigation right now (at their last good position when GPS is lost). */
  feed(tracks: TrackObject[], now = Date.now()): { lng: number; lat: number; lost: boolean; id: string }[] {
    const bad: { lng: number; lat: number; lost: boolean; id: string }[] = [];
    for (const t of tracks) {
      const p = t.props as unknown as AircraftProps;
      if (p.nav === undefined || p.nav < 0) continue;
      const lost = p.navLng !== undefined && p.navLat !== undefined;
      const lng = lost ? p.navLng! : t.lng;
      const lat = lost ? p.navLat! : t.lat;
      if (p.nav === 1) bad.push({ lng, lat, lost, id: t.id });
      const cell = cellOf(lng, lat);
      const key = `${t.id}|${cell}`;
      const prev = this.obs.get(key);
      this.obs.set(key, { cell, seenAt: now, badAt: p.nav === 1 ? now : (prev?.badAt ?? null) });
    }
    return bad;
  }

  cells(now = Date.now()): GnssCell[] {
    const tally = new Map<string, { n: number; bad: number }>();
    for (const [key, o] of this.obs) {
      if (now - o.seenAt > WINDOW_MS) { this.obs.delete(key); continue; }
      const t = tally.get(o.cell) ?? { n: 0, bad: 0 };
      t.n++;
      if (o.badAt !== null && now - o.badAt <= WINDOW_MS) t.bad++;
      tally.set(o.cell, t);
    }
    const out: GnssCell[] = [];
    for (const [cell, { n, bad }] of tally) {
      if (n < MIN_AIRCRAFT) continue;
      const [r, c] = cell.split(':').map(Number) as [number, number];
      const pct = (100 * Math.max(0, bad - 1)) / n;
      out.push({ id: cell, w: c * CELL_DEG, s: r * CELL_DEG, n, bad, pct, level: levelOf(pct) });
    }
    return out;
  }

  get size(): number { return this.obs.size; }
}

export function cellsGeoJson(cells: GnssCell[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: 'FeatureCollection',
    features: cells.map((c) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[c.w, c.s], [c.w + CELL_DEG, c.s], [c.w + CELL_DEG, c.s + CELL_DEG], [c.w, c.s + CELL_DEG], [c.w, c.s]]] },
      properties: { id: c.id, level: c.level, n: c.n, bad: c.bad, pct: Math.round(c.pct * 10) / 10, lat: c.s + CELL_DEG / 2, lng: c.w + CELL_DEG / 2 },
    })),
  };
}
