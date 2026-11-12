// Election results by area (Germany: Bundestag + Landtage per Land, USA: president per state), time aware.
// Files: public/data/wahlen/{de,us}.json (+ -geo.json). Pure functions; the layers do the loading.
import type { Feature, FeatureCollection, Geometry } from 'geojson';

export type ElKind = 'btw' | 'ltw' | 'pres';
export interface PartyDef { id: string; label: string; color: string }

export const DE_PARTIES: PartyDef[] = [
  { id: 'CDU', label: 'CDU', color: '#7A7F8C' }, { id: 'CSU', label: 'CSU', color: '#0A6AA8' }, { id: 'SPD', label: 'SPD', color: '#D0104A' },
  { id: 'GRUENE', label: 'Bündnis 90/Die Grünen', color: '#1FA463' }, { id: 'FDP', label: 'FDP', color: '#F7BC3D' }, { id: 'LINKE', label: 'Die Linke', color: '#9A4DB5' },
  { id: 'AFD', label: 'AfD', color: '#63B6E8' }, { id: 'BSW', label: 'BSW', color: '#C85BC5' }, { id: 'SSW', label: 'SSW', color: '#D8B64A' },
  { id: 'FW', label: 'Freie Wähler', color: '#8DB849' }, { id: 'SONST', label: 'Sonstige', color: '#9AA3AE' },
];
export const US_PARTIES: PartyDef[] = [
  { id: 'DEMOCRAT', label: 'Demokraten', color: '#3B7DD8' }, { id: 'REPUBLICAN', label: 'Republikaner', color: '#E0524B' },
  { id: 'LIBERTARIAN', label: 'Libertarian Party', color: '#E8B93C' }, { id: 'GREEN', label: 'Grüne', color: '#4EA55B' }, { id: 'OTHER', label: 'Sonstige', color: '#9AA3AE' },
];

/** Election days of the German file (Bundestag and Landtage), in the layer's `frames`. A test keeps this in sync with de.json. */
export const DE_DAYS = ["1990-01-28", "1990-10-14", "1990-12-02", "1994-06-26", "1994-09-11", "1994-10-16", "1998-03-01", "1998-04-26", "1998-09-27", "1999-09-05", "1999-09-12", "1999-09-19", "1999-10-10", "2000-02-27", "2000-05-14", "2001-03-25", "2001-10-21", "2002-04-21", "2002-09-22", "2003-02-02", "2003-05-25", "2004-06-13", "2004-09-05", "2004-09-19", "2005-02-20", "2005-05-22", "2005-09-18", "2006-03-26", "2006-09-17", "2007-05-13", "2008-01-27", "2008-02-24", "2008-09-28", "2009-01-18", "2009-08-30", "2009-09-27", "2010-05-09", "2011-02-20", "2011-03-20", "2011-03-27", "2011-05-22", "2011-09-04", "2011-09-18", "2012-03-25", "2012-05-13", "2013-01-20", "2013-09-15", "2013-09-22", "2014-08-31", "2014-09-14", "2015-02-15", "2015-05-10", "2016-03-13", "2016-09-04", "2016-09-18", "2017-03-26", "2017-05-07", "2017-05-14", "2017-09-24", "2017-10-15", "2018-10-14", "2018-10-28", "2019-05-26", "2019-09-01", "2019-10-27", "2020-02-23", "2021-03-14", "2021-06-06", "2021-09-26", "2022-03-27", "2022-05-08", "2022-05-15", "2022-10-09", "2023-02-12", "2023-05-14", "2023-10-08", "2024-09-01", "2024-09-22", "2025-02-23", "2025-03-02", "2026-03-08", "2026-03-22", "2026-09-06"];
/** Election days of the US file. */
export const US_DAYS = ["1976-11-02", "1980-11-04", "1984-11-06", "1988-11-08", "1992-11-03", "1996-11-05", "2000-11-07", "2004-11-02", "2008-11-04", "2012-11-06", "2016-11-08", "2020-11-03", "2024-11-05"];

export interface RawParty extends Array<string | number> { 0: string; 1: number }
export interface DeDoc { regions: Record<string, string>; btw: { d: string; g: Record<string, { p: [string, number][]; b: number | null }> }[]; ltw: { d: string; r: string; p: [string, number][]; b: number | null }[] }
export interface UsDoc { regions: Record<string, string>; pres: { d: string; g: Record<string, { p: [string, number][]; t: number; c: Record<string, string> }> }[] }

export interface Election { label: string; kind: ElKind; day: string; t: number; results: Map<string, { p: [string, number][]; turnout?: number; total?: number; cand?: Record<string, string> }> }

export const dayMs = (d: string): number => Date.parse(`${d.slice(0, 10)}T12:00:00Z`);

export function deElections(doc: DeDoc): Election[] {
  const out: Election[] = [];
  for (const e of doc.btw) out.push({ label: `Bundestagswahl ${e.d.slice(0, 4)}`, kind: 'btw', day: e.d, t: dayMs(e.d), results: new Map(Object.entries(e.g).map(([k, v]) => [k, { p: v.p, turnout: v.b ?? undefined }])) });
  for (const e of doc.ltw) out.push({ label: `Landtagswahl ${doc.regions[e.r] ?? e.r} ${e.d.slice(0, 4)}`, kind: 'ltw', day: e.d, t: dayMs(e.d), results: new Map([[e.r, { p: e.p, turnout: e.b ?? undefined }]]) });
  return out.sort((a, b) => a.t - b.t);
}
export function usElections(doc: UsDoc): Election[] {
  return doc.pres.map((e) => ({ label: `Präsidentschaftswahl ${e.d.slice(0, 4)}`, kind: 'pres' as const, day: e.d, t: dayMs(e.d), results: new Map(Object.entries(e.g).map(([k, v]) => [k, { p: v.p, total: v.t, cand: v.c }])) }));
}

/** Tolerance: the timeline's frame drifts with the 30 s clock, the election is "in effect" from noon of its day. */
const TOL = 12 * 3_600_000;

export interface AreaResult { region: string; election: Election; p: [string, number][]; turnout?: number; total?: number; cand?: Record<string, string> }

/** Per area the latest election (of the allowed kinds) on or before `t`. */
export function resultsAt(elections: Election[], t: number, kinds: ElKind[], regions: string[]): Map<string, AreaResult> {
  const out = new Map<string, AreaResult>();
  for (let i = elections.length - 1; i >= 0; i--) {
    const e = elections[i]!;
    if (e.t > t + TOL || !kinds.includes(e.kind)) continue;
    for (const [k, r] of e.results) if (!out.has(k) && regions.includes(k)) out.set(k, { region: k, election: e, ...r });
  }
  return out;
}

/** Winner by votes; `SONST`/`OTHER` never win. */
export function winnerOf(p: [string, number][], skip = ['SONST', 'OTHER']): [string, number] | undefined {
  let best: [string, number] | undefined;
  for (const q of p) if (!skip.includes(q[0]) && (!best || q[1] > best[1])) best = q;
  return best;
}

export type AreaProps = { k: string; n: string; winner: string; color: string; share: number; margin: number; election: string; day: string; t: number; turnout: number; parties: string; cand: string; kind: ElKind };

/** Geometry joined with the results at `t`; areas without result are dropped. */
export function areaCollection(geo: FeatureCollection, results: Map<string, AreaResult>, parties: PartyDef[], names: Record<string, string>): FeatureCollection<Geometry, AreaProps> {
  const col = new Map(parties.map((p) => [p.id, p.color]));
  const features: Feature<Geometry, AreaProps>[] = [];
  for (const f of geo.features) {
    const k = String((f.properties as { k?: string }).k);
    const r = results.get(k);
    if (!r) continue;
    const sum = r.p.reduce((s, q) => s + q[1], 0);
    const w = winnerOf(r.p);
    if (!w || !sum) continue;
    const second = r.p.filter((q) => q !== w && !['SONST', 'OTHER'].includes(q[0])).reduce((m, q) => Math.max(m, q[1]), 0);
    features.push({
      type: 'Feature', geometry: f.geometry,
      properties: {
        k, n: names[k] ?? k, winner: w[0], color: col.get(w[0]) ?? '#9AA3AE', share: w[1] / sum, margin: (w[1] - second) / sum,
        election: r.election.label, day: r.election.day, t: r.election.t, turnout: r.turnout ?? (r.total ? sum / r.total : 0), kind: r.election.kind,
        parties: JSON.stringify(r.p), cand: r.cand ? JSON.stringify(r.cand) : '',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
