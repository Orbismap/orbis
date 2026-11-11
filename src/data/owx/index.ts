// Weather fields (ICON, OWX). Files are immutable per run; decoding runs in the worker pool.
import { bucketUrl } from '../endpoints';
import { fetchJson, fetchRaw } from '../http';
import { runParser } from '../worker/pool';
import type { OwxField, OwxHeader } from './decode';

export type { OwxField, OwxHeader } from './decode';
export { owxValue } from './decode';

export interface OwxVarInfo { icon: string; scale: number; offset: number; unit: string; min: number; max: number; bytes: number; static?: boolean }
export interface OwxLatest {
  v: number;
  model: string;
  /** e.g. "2026111012" */
  run: string;
  issued: number;
  generated: number;
  /** UTC ms of every time step */
  times: number[];
  attribution: string;
  overview: { res: number; nx: number; ny: number };
  tiles: { res: number; size: number; cols: number; rows: number; overlap: number };
  vars: Record<string, OwxVarInfo>;
}

/** Overview (whole earth, 0.5°) or a 45° tile (c = 0..7 from west, r = 0..3 from north). */
export type OwxPart = 'o' | { c: number; r: number };

export const SUPPORTED_MAJOR = 1;

export async function loadLatest(signal?: AbortSignal): Promise<OwxLatest> {
  const { data } = await fetchJson<OwxLatest>(bucketUrl('wetter', 'v1/latest.json'), { signal, revalidate: true });
  if (data.v !== SUPPORTED_MAJOR) throw new Error('Wetterdaten-Format unbekannt');
  return data;
}

export const owxUrl = (run: string, variable: string, part: OwxPart) =>
  bucketUrl('wetter', `v1/${run}/${variable}/${part === 'o' ? 'o' : `t${part.c}_${part.r}`}.owx`);

/** Fetches and decodes any OWX file; the Int16Array comes back transferred from the worker. */
export async function loadOwx(url: string, signal?: AbortSignal): Promise<OwxField> {
  const { data } = await fetchRaw<ArrayBuffer>(url, { format: 'arraybuffer', signal, timeout: 60_000 });
  return runParser('owxDecode', data, { format: 'arraybuffer', signal });
}

export const loadField = (run: string, variable: string, part: OwxPart, signal?: AbortSignal): Promise<OwxField> =>
  loadOwx(owxUrl(run, variable, part), signal);

/** Tile column/row of a position (for picking the 45° tiles of a viewport). */
export function tileOf(lng: number, lat: number): { c: number; r: number } {
  return { c: Math.min(7, Math.max(0, Math.floor((((lng + 180) % 360) + 360) % 360 / 45))), r: Math.min(3, Math.max(0, Math.floor((90 - lat) / 45))) };
}

/** Physical value of a quantised sample. */
export const dequantize = (h: Pick<OwxHeader, 'scale' | 'offset' | 'nodata'>, q: number): number | undefined =>
  q === h.nodata ? undefined : q * h.scale + h.offset;
