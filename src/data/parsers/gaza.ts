// Gaza / West Bank data: IDMC displacement events, Healthsites facilities, IPC areas (bucket snapshots) and the daily
// Tech for Palestine figures (read at a selected time).
import type { Feature, FeatureCollection, Geometry, Point } from 'geojson';

export type DisplaceProps = { id: string; t: number; people: number; place: string; type: string; kind: string; event: string; source: string; text: string };
export type DisplaceCollection = FeatureCollection<Point, DisplaceProps> & { built?: string };
interface RawDisp { d?: string; lat?: number; lon?: number; f?: number; l?: string; t?: string; k?: string; e?: string; s?: string; x?: string }

export function gazaDisplacement(raw: unknown): DisplaceCollection {
  const doc = raw as { built?: string; events?: RawDisp[] } | null;
  const features: Feature<Point, DisplaceProps>[] = [];
  for (const e of doc?.events ?? []) {
    const t = e.d ? Date.parse(`${e.d}T12:00:00Z`) : NaN;
    if (!Number.isFinite(t) || !Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lon!, e.lat!] }, properties: { id: String(features.length), t, people: e.f ?? 0, place: e.l ?? '', type: e.t ?? '', kind: e.k ?? '', event: e.e ?? '', source: e.s ?? '', text: e.x ?? '' } });
  }
  return { type: 'FeatureCollection', features, built: doc?.built };
}

export type HealthProps = { id: string; kind: string; name: string; operator: string; url: string };
export type HealthCollection = FeatureCollection<Point, HealthProps> & { built?: string };
interface RawPlace { lon?: number; lat?: number; a?: string; n?: string; o?: string; u?: string }

export function healthSites(raw: unknown): HealthCollection {
  const doc = raw as { built?: string; places?: RawPlace[] } | null;
  const features: Feature<Point, HealthProps>[] = [];
  for (const p of doc?.places ?? []) {
    if (!Number.isFinite(p.lon) || !Number.isFinite(p.lat)) continue;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon!, p.lat!] }, properties: { id: String(features.length), kind: p.a ?? '', name: p.n ?? '', operator: p.o ?? '', url: p.u ?? '' } });
  }
  return { type: 'FeatureCollection', features, built: doc?.built };
}

export interface IpcPeriod { from: string; to: string; kind: string; analysis: string; p: Record<string, number>; n: Record<string, number> }
export type IpcProps = { id: string; name: string; phase: number; pop: number; period: string; shares: string; people: string; history: string };
export type IpcCollection = FeatureCollection<Geometry, IpcProps> & { built?: string };
interface RawIpc { name?: string; geometry?: Geometry; phase?: number; period?: string; pop?: number; shares?: number[]; people?: number[]; history?: IpcPeriod[] }

export function ipcAreas(raw: unknown): IpcCollection {
  const doc = raw as { built?: string; areas?: RawIpc[] } | null;
  const features: Feature<Geometry, IpcProps>[] = [];
  for (const a of doc?.areas ?? []) {
    if (!a.geometry) continue;
    features.push({ type: 'Feature', geometry: a.geometry, properties: { id: a.name ?? String(features.length), name: a.name ?? '', phase: a.phase ?? 0, pop: a.pop ?? 0, period: a.period ?? '', shares: JSON.stringify(a.shares ?? []), people: JSON.stringify(a.people ?? []), history: JSON.stringify((a.history ?? []).filter((h) => h.p?.['3+'] != null)) } });
  }
  return { type: 'FeatureCollection', features, built: doc?.built };
}

export interface GazaDay { report_date: string; ext_killed_cum?: number; killed_cum?: number; ext_injured_cum?: number; injured_cum?: number; ext_killed_children_cum?: number; ext_killed_women_cum?: number; ext_med_killed_cum?: number; ext_press_killed_cum?: number; ext_civdef_killed_cum?: number }
export interface WestBankDay { report_date: string; killed_cum?: number; killed_children_cum?: number; injured_cum?: number; settler_attacks_cum?: number; displaced_persons_cum?: number }

/** Last row on or before the day of `t` (rows ascending by report_date). */
export function rowAt<T extends { report_date: string }>(rows: T[] | undefined, t: number): T | undefined {
  if (!rows?.length) return undefined;
  const day = new Date(t).toISOString().slice(0, 10);
  let lo = 0, hi = rows.length - 1, best: T | undefined;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (rows[m]!.report_date <= day) { best = rows[m]; lo = m + 1; } else hi = m - 1;
  }
  return best;
}
