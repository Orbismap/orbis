// Digitraffic Rail (Fintraffic, CC BY 4.0): `/api/v1/train-locations/latest` -> tracks. The feed carries no heading;
// the layer derives it from consecutive fixes (see `withHeading`).
import { bearing, haversine } from '../../core/geo';
import type { TrackObject } from '../../render/tracks';

export type TrainProps = { num: number; date: string; kmh: number; hd: boolean };

export function trainLocations(raw: unknown): TrackObject[] {
  if (!Array.isArray(raw)) return [];
  const out: TrackObject[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const c = (r.location as { coordinates?: number[] } | undefined)?.coordinates;
    const num = r.trainNumber;
    if (!c || c.length < 2 || typeof num !== 'number') continue;
    const date = String(r.departureDate ?? '');
    const kmh = Number(r.speed) || 0;
    out.push({
      id: `${date}:${num}`,
      lng: c[0]!,
      lat: c[1]!,
      speed: kmh / 3.6,
      t: Date.parse(String(r.timestamp)) || Date.now(),
      props: { num, date, kmh, hd: false } satisfies TrainProps,
    });
  }
  return out;
}

/**
 * Adds a heading from the previous fix of the same train. `prev` is updated in place (id -> last position and heading).
 * Fixes closer than 25 m keep the previous heading; trains never seen moving stay without one.
 */
export function withHeading(
  tracks: TrackObject[],
  prev: Map<string, { lng: number; lat: number; heading?: number }>,
): TrackObject[] {
  const seen = new Set<string>();
  const out = tracks.map((t) => {
    seen.add(t.id);
    const p = prev.get(t.id);
    let heading = p?.heading;
    if (p && haversine([p.lng, p.lat], [t.lng, t.lat]) > 0.025) heading = bearing([p.lng, p.lat], [t.lng, t.lat]);
    prev.set(t.id, { lng: t.lng, lat: t.lat, heading });
    return { ...t, heading, props: { ...t.props, hd: heading !== undefined } };
  });
  for (const k of prev.keys()) if (!seen.has(k)) prev.delete(k);
  return out;
}

/** Finnish train category names. */
export const TRAIN_CATEGORY: Record<string, string> = {
  'Long-distance': 'Fernverkehr', Commuter: 'Nahverkehr', Cargo: 'Güterzug', Locomotive: 'Lokfahrt', Shunting: 'Rangierfahrt', 'On-track machines': 'Gleisbaumaschine',
};

export type TrainDetail = { title: string; category: string; from: string; to: string; delay?: number; lastStation: string; operator: string };

/** `/trains/{date}/{num}` + station names -> card data. */
export function trainDetail(raw: unknown, names: Record<string, string>, num: number): TrainDetail | undefined {
  const t = (Array.isArray(raw) ? raw[0] : undefined) as Record<string, unknown> | undefined;
  if (!t) return undefined;
  const rows = (t.timeTableRows as { stationShortCode: string; actualTime?: string; differenceInMinutes?: number }[] | undefined) ?? [];
  const name = (c?: string) => (c ? (names[c] ?? c) : '');
  const last = [...rows].reverse().find((r) => r.actualTime);
  const line = String(t.commuterLineID ?? '');
  return {
    title: `${line ? `Linie ${line}` : String(t.trainType ?? 'Zug')} ${num}`,
    category: TRAIN_CATEGORY[String(t.trainCategory)] ?? String(t.trainCategory ?? ''),
    from: name(rows[0]?.stationShortCode),
    to: name(rows[rows.length - 1]?.stationShortCode),
    delay: last?.differenceInMinutes,
    lastStation: name(last?.stationShortCode),
    operator: String(t.operatorShortCode ?? ''),
  };
}

export function stationNames(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(raw)) for (const s of raw as { stationShortCode?: string; stationName?: string }[]) if (s.stationShortCode && s.stationName) out[s.stationShortCode] = s.stationName.replace(/ asema$/, '');
  return out;
}
