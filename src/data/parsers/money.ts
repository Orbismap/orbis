// "Who Funded Genocide" data (CC BY 4.0): money flows between countries (arcs) and PAC money per US congressional district.
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';

export type FlowCls = 'money' | 'ordered' | 'ceiling' | 'structure';
export interface FlowData {
  credit: string;
  countries: { name: string; lat: number; lon: number; notes: string[] }[];
  arcs: { board: string; from: string; to: string; cls: FlowCls; amounts?: { currency: string; amount: number }[]; lines: number; label: string; text: string; sources: { id: string; title: string; url: string; locator: string }[] }[];
}
export type ArcProps = { id: string; cls: FlowCls; from: string; to: string; amounts: string; lines: number; label: string; text: string; board: string; sources: string };
export type CountryProps = { id: string; name: string; notes: string };

/** Curved line between two points (quadratic bend perpendicular to the chord); `bend` keeps arcs of the same pair apart. */
export function arcLine(a: [number, number], b: [number, number], bend: number, steps = 48): [number, number][] {
  // shortest way round the antimeridian
  let bx = b[0];
  if (bx - a[0] > 180) bx -= 360; else if (bx - a[0] < -180) bx += 360;
  const dx = bx - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const cx = (a[0] + bx) / 2 - (dy / len) * len * 0.22 * (1 + bend), cy = (a[1] + b[1]) / 2 + (dx / len) * len * 0.22 * (1 + bend);
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([+(u * u * a[0] + 2 * u * t * cx + t * t * bx).toFixed(3), +(u * u * a[1] + 2 * u * t * cy + t * t * b[1]).toFixed(3)]);
  }
  return out;
}

const BEND: Record<FlowCls, number> = { money: 0, ordered: 0.5, ceiling: -0.5, structure: 1 };

export function flowLines(d: FlowData): { arcs: FeatureCollection<LineString, ArcProps>; countries: FeatureCollection<Point, CountryProps> } {
  const pos = new Map(d.countries.map((c) => [c.name, [c.lon, c.lat] as [number, number]]));
  const arcs: Feature<LineString, ArcProps>[] = [];
  for (const a of d.arcs ?? []) {
    const f = pos.get(a.from), t = pos.get(a.to);
    if (!f || !t) continue;
    arcs.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: arcLine(f, t, BEND[a.cls] ?? 0) }, properties: { id: `a${arcs.length}`, cls: a.cls, from: a.from, to: a.to, amounts: JSON.stringify(a.amounts ?? []), lines: a.lines, label: a.label, text: a.text, board: a.board, sources: JSON.stringify(a.sources ?? []) } });
  }
  const countries: Feature<Point, CountryProps>[] = d.countries.filter((c) => Number.isFinite(c.lon) && Number.isFinite(c.lat)).map((c) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: { id: c.name, name: c.name, notes: JSON.stringify(c.notes ?? []) } }));
  return { arcs: { type: 'FeatureCollection', features: arcs }, countries: { type: 'FeatureCollection', features: countries } };
}

export interface Member { n: string; p: string; d: string; lon: number; lat: number; don: number; ie: number; aipac: number; backers: string[] }
export type MemberProps = { id: string; name: string; party: string; district: string; don: number; ie: number; aipac: number; sum: number; backers: string };

export function congressPoints(d: { members?: Member[] } | null): FeatureCollection<Point, MemberProps> {
  const features: Feature<Point, MemberProps>[] = [];
  for (const m of d?.members ?? []) {
    const sum = (m.don ?? 0) + (m.ie ?? 0);
    if (sum <= 0 || !Number.isFinite(m.lon) || !Number.isFinite(m.lat)) continue;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [m.lon, m.lat] }, properties: { id: `${m.d}-${features.length}`, name: m.n, party: m.p, district: m.d, don: m.don ?? 0, ie: m.ie ?? 0, aipac: m.aipac ?? 0, sum, backers: (m.backers ?? []).join(', ') } });
  }
  return { type: 'FeatureCollection', features };
}
