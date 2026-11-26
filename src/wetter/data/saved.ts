/** The last forecast per place, kept on the device: shown at once on the next visit and when the sources cannot be reached. */
import { lastKnown, type Known } from '@/core/lastKnown';
import type { PointSeries, WarningInfo, WeatherSupplements } from './types';

export interface Snapshot {
  series: PointSeries;
  supplements: WeatherSupplements;
}

const store = lastKnown<Snapshot>('wetter:points', 20);
const keyOf = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

const DAY = 86_400_000;

/** JSON turns gaps in a list (`undefined`) into null. */
const gaps = <T>(list: (T | undefined)[] | undefined) => list?.map((v) => v ?? undefined);

function revive(series: PointSeries): PointSeries {
  return Object.fromEntries(Object.entries(series).map(([k, v]) => [k, Array.isArray(v) ? gaps(v) : v])) as unknown as PointSeries;
}

/** Saved data ages: days that are over drop out (the first one is "today"), warnings that ran out too. */
export function current(supplements: WeatherSupplements, offsetSeconds: number, now: number): WeatherSupplements {
  const dayOf = (ms: number) => Math.floor((ms + offsetSeconds * 1000) / DAY);
  const from = supplements.daily?.findIndex((d) => dayOf(d.date) >= dayOf(now)) ?? -1;
  const { warning } = supplements;
  return {
    ...supplements,
    visibility: gaps(supplements.visibility),
    ...(from > 0 ? { daily: supplements.daily!.slice(from), sun: supplements.sun?.slice(from) } : {}),
    warning: warning?.expires !== undefined && warning.expires <= now ? undefined : warning,
  };
}

export function readSnapshot(lat: number, lng: number, now = Date.now()): Known<Snapshot> | undefined {
  const k = store.get(keyOf(lat, lng));
  if (!k) return undefined;
  const series = revive(k.data.series);
  return { at: k.at, data: { series, supplements: current(k.data.supplements, series.offsetSeconds, now) } };
}

export function saveSnapshot(lat: number, lng: number, snapshot: Snapshot, at?: number): void {
  store.put(keyOf(lat, lng), snapshot, at);
}

/** The warnings load after the forecast: they join the saved one (its age stays that of the forecast). */
export function saveWarning(lat: number, lng: number, warning: WarningInfo | undefined): void {
  const k = store.get(keyOf(lat, lng));
  if (k) store.put(keyOf(lat, lng), { ...k.data, supplements: { ...k.data.supplements, warning } }, k.at);
}
