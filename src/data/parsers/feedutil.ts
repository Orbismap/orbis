// Helpers shared by the vehicle feed adapters (feed-*.ts).
import { fetchRaw } from '../http';
import { gtfsRtVehicles, type RtVehicle } from './gtfsrt';
import type { VehicleFix, VehicleKind } from './vehicles';

export const getBuffer = async (url: string, signal: AbortSignal, headers?: Record<string, string>, timeout = 25_000): Promise<ArrayBuffer> =>
  (await fetchRaw<ArrayBuffer>(url, { format: 'arraybuffer', signal, headers, timeout })).data;

export const getJson = async <T>(url: string, signal: AbortSignal, headers?: Record<string, string>, timeout = 25_000): Promise<T> =>
  (await fetchRaw<T>(url, { format: 'json', signal, headers, timeout })).data;

/** Position of a GTFS-RT vehicle -> fix. `line`/`kind` may be decided per vehicle. */
export function rtFix(v: RtVehicle, src: string, kind: VehicleKind, line: string, extra: Partial<VehicleFix> = {}): VehicleFix {
  return {
    id: `${src}:${v.id ?? v.label ?? v.tripId ?? `${v.lat.toFixed(4)},${v.lon.toFixed(4)}`}`,
    lng: v.lon, lat: v.lat,
    heading: v.bearing !== undefined && Number.isFinite(v.bearing) ? v.bearing : undefined,
    speed: v.speed !== undefined && v.speed >= 0 ? v.speed : undefined,
    t: v.timestamp ? v.timestamp * 1000 : Date.now(),
    kind, line, src, ...extra,
  };
}

/** Decodes a GTFS-RT buffer and maps each vehicle. */
export function rtFixes(buf: ArrayBuffer, src: string, map: (v: RtVehicle) => { kind: VehicleKind; line: string } & Partial<VehicleFix>): VehicleFix[] {
  return gtfsRtVehicles(buf).map((v) => {
    const { kind, line, ...extra } = map(v);
    return rtFix(v, src, kind, line, extra);
  });
}

/** Several sources at once; fails only when all of them fail. */
export async function settleAll<T>(jobs: Promise<T[]>[]): Promise<T[]> {
  const r = await Promise.allSettled(jobs);
  if (r.every((x) => x.status === 'rejected')) throw (r[0] as PromiseRejectedResult).reason;
  return r.flatMap((x) => (x.status === 'fulfilled' ? x.value : []));
}

export const toNum = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
