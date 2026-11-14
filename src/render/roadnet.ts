// Turns the road lines of the OpenFreeMap tiles (as queried from the map) into what the street-scale rendering draws:
// smoothed lines with a real width, and marking lines (centre / lane dividers) that stop at junctions.
import type { Feature, FeatureCollection, LineString, MultiPolygon, Point, Polygon } from 'geojson';
import { cutLine, junctionZones, localFrame, smooth, kerbStrips, lineLength, pathCrossings, pointAlong, snapNetwork, takeFromStart, zebraStripes, type NetLine, type XY } from './roadgeom';

/** level from the OSM `layer` tag (and bridge/tunnel): -1 below ground (tunnel, underpass), 0 ground, 1 and 2 raised (bridges, stacked bridges) */
export interface RawRoad { cls: string; oneway: number; level: number; coords: number[][] }
/** mid: dash pattern of the centre line ('' none): a/b/c/d are rising dash lengths */
export type Mid = '' | 'a' | 'b' | 'c' | 'd';
/** pth: 1 for footways and cycle ways (no kerb) */
export interface RoadProps { cls: string; rank: number; w: number; ow: number; mid: Mid; lv: number; pth: number }
export const PATH_CLASSES = ['foot', 'cycle', 'steps', 'ped'];
export type RoadFC = FeatureCollection<LineString, RoadProps>;
export type KerbFC = FeatureCollection<Polygon, { lv: number; c: string }>;
export type MarkFC = FeatureCollection<LineString, { mid: Mid; lv: number }>;

const SPEC: Record<string, { rank: number; w: number; mid: Mid }> = {
  // footways, cycle ways, steps, pedestrian streets: drawn under the roads, without kerb or markings
  foot: { rank: 0, w: 1.8, mid: '' },
  cycle: { rank: 0, w: 2, mid: '' },
  steps: { rank: 0, w: 1.8, mid: '' },
  ped: { rank: 0, w: 4, mid: '' },
  service: { rank: 1, w: 2.6, mid: '' },
  link: { rank: 2, w: 4.2, mid: '' },
  minor: { rank: 3, w: 5, mid: 'd' },
  tertiary: { rank: 4, w: 6, mid: 'a' },
  secondary: { rank: 5, w: 6.5, mid: 'a' },
  primary: { rank: 6, w: 7.2, mid: 'b' },
  trunk: { rank: 7, w: 7.8, mid: 'c' },
  motorway: { rank: 8, w: 8.4, mid: 'c' },
};
const NARROW_WHEN_ONEWAY = new Set(['service', 'minor', 'tertiary', 'secondary']);

/** The drawing class of an OpenFreeMap `transportation` feature, or undefined for everything that is not a street. */
export function roadClass(p: { class?: unknown; ramp?: unknown; subclass?: unknown }): string | undefined {
  const c = p.class;
  if (c === 'path' || c === 'track') {
    const sub = p.subclass;
    return sub === 'cycleway' ? 'cycle' : sub === 'steps' ? 'steps' : sub === 'pedestrian' ? 'ped' : 'foot';
  }
  if (c === 'pedestrian') return 'ped';
  if (c === 'motorway' || c === 'trunk' || c === 'primary' || c === 'secondary' || c === 'tertiary') return Number(p.ramp) === 1 ? 'link' : c;
  if (c === 'minor' || c === 'street' || c === 'street_limited') return 'minor';
  if (c === 'service') return 'service';
  return undefined;
}

export const roadSpec = (cls: string, oneway: number) => {
  const s = SPEC[cls]!;
  const narrow = oneway !== 0 && NARROW_WHEN_ONEWAY.has(cls);
  return { rank: s.rank, w: narrow ? Math.max(2.4, s.w * 0.62) : s.w, mid: narrow ? ('' as Mid) : s.mid };
};

/** extra width of the kerb beyond the surface (metres): ground roads, and the middle of a bridge */
export const GROUND_KERB = 1, BRIDGE_KERB = 2.4;
/** kerb colours: normal road and bridge; the kerb blends from one to the other on the road leading to a bridge */
export const KERB_GROUND = '#364058', KERB_BRIDGE = '#56627f';
const TAPER = 14;
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export const lerpColour = (a: string, b: string, t: number) => `#${hex(a).map((v, i) => Math.round(v + (hex(b)[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
const Q = 0.3;
const key = (a: XY, b: XY, cls: string) => {
  const p = `${Math.round(a[0] / Q)},${Math.round(a[1] / Q)}`, q = `${Math.round(b[0] / Q)},${Math.round(b[1] / Q)}`;
  return p < q ? `${cls}|${p}|${q}` : `${cls}|${q}|${p}`;
};

type Run = { r: RawRoad; pts: XY[]; spec: ReturnType<typeof roadSpec> };
const endKey = (p: XY) => `${Math.round(p[0] / Q)},${Math.round(p[1] / Q)}`;

/**
 * Joins pieces of the same road that meet end to end (tile borders, deduplicated parts, ways split at a node), so a bend
 * between two pieces is smoothed like any other bend instead of staying a hard corner with a gap. Only pieces of the same
 * class and level that meet exactly two at a place are joined; a oneway road is never turned around.
 */
export function mergeChains(runs: Run[]): Run[] {
  const lines: (Run | undefined)[] = runs.map((x) => ({ ...x, pts: [...x.pts] }));
  const at = new Map<string, number[]>();
  const put = (k: string, i: number) => { const l = at.get(k); if (l) l.push(i); else at.set(k, [i]); };
  lines.forEach((l, i) => { put(endKey(l!.pts[0]!), i); put(endKey(l!.pts[l!.pts.length - 1]!), i); });
  for (const [k, list] of [...at]) {
    // the list may have changed through earlier merges
    const cur = at.get(k);
    if (!cur || cur.length !== 2 || cur[0] === cur[1]) continue;
    const [ia, ib] = cur as [number, number];
    const a = lines[ia], b = lines[ib];
    if (!a || !b || a.r.cls !== b.r.cls || a.r.level !== b.r.level || a.r.oneway !== b.r.oneway) continue;
    const aEnd = endKey(a.pts[a.pts.length - 1]!) === k, bStart = endKey(b.pts[0]!) === k;
    let pts: XY[];
    if (aEnd && bStart) pts = [...a.pts, ...b.pts.slice(1)];
    else if (!aEnd && !bStart) pts = [...b.pts, ...a.pts.slice(1)]; // a starts here, b ends here
    else if (a.r.oneway !== 0) continue; // would have to turn a oneway road around
    else if (aEnd) pts = [...a.pts, ...[...b.pts].reverse().slice(1)];
    else pts = [...[...a.pts].reverse(), ...b.pts.slice(1)];
    // the new ends: re-register under the merged line (a), drop b
    at.delete(k);
    const first = endKey(pts[0]!), last = endKey(pts[pts.length - 1]!);
    for (const key of [first, last]) {
      const l = at.get(key);
      if (l) at.set(key, l.map((i) => (i === ib ? ia : i)));
    }
    a.pts = pts;
    lines[ib] = undefined;
    void list;
  }
  return lines.filter((l): l is Run => !!l);
}

export function buildRoadNet(raw: RawRoad[], lon0: number, lat0: number): { roads: RoadFC; marks: MarkFC; kerbs: KerbFC; arrows: FeatureCollection<Point, { rot: number; lv: number }>; zebras: FeatureCollection<MultiPolygon, { lv: number; mid: number[] }> } {
  const fr = localFrame(lon0, lat0);
  // tiles overlap in their buffers: the same segment can arrive twice, so lines are cut where a segment was already seen
  const seen = new Set<string>();
  const runs: { r: RawRoad; pts: XY[]; spec: ReturnType<typeof roadSpec> }[] = [];
  for (const r of raw) {
    if (!SPEC[r.cls] || r.coords.length < 2) continue;
    const pts = r.coords.map((c) => fr.to(c));
    const spec = roadSpec(r.cls, r.oneway);
    let run: XY[] = [pts[0]!];
    const flush = () => { if (run.length >= 2) runs.push({ r, pts: run, spec }); };
    for (let i = 1; i < pts.length; i++) {
      const k = key(pts[i - 1]!, pts[i]!, r.cls);
      if (seen.has(k)) { flush(); run = [pts[i]!]; continue; }
      seen.add(k);
      run.push(pts[i]!);
    }
    flush();
  }
  const joined = mergeChains(runs);
  // junctions first (ends snapped onto the road they join, those places pinned), then the corners are rounded around them
  const snapped = snapNetwork(joined.map((x) => x.pts));
  const lines = joined.map((x, i) => ({ r: x.r, pts: smooth(snapped.lines[i]!, PATH_CLASSES.includes(x.r.cls) ? [1.2] : [14, 7], snapped.pinned[i]), spec: x.spec }));
  const roads: Feature<LineString, RoadProps>[] = lines.map(({ r, pts, spec }) => ({
    type: 'Feature', geometry: { type: 'LineString', coordinates: pts.map(fr.from) },
    properties: { cls: r.cls, rank: spec.rank, w: spec.w, ow: r.oneway, mid: spec.mid, lv: r.level, pth: PATH_CLASSES.includes(r.cls) ? 1 : 0 },
  }));
  // footways do not interrupt the markings of the roads they cross
  const roadIdx: number[] = [];
  const net: NetLine[] = [];
  lines.forEach(({ r, pts, spec }, i) => { if (!PATH_CLASSES.includes(r.cls)) { roadIdx.push(i); net.push({ pts, hw: spec.w / 2, level: r.level }); } });
  const roadZones = junctionZones(net);
  // everything that stops the markings of a line: junctions, crossings and arrows (zones in metres along the line)
  const zonesAll = new Map<number, [number, number][]>();
  const addZone = (i: number, a: number, b: number) => { const z = zonesAll.get(i); if (z) z.push([a, b]); else zonesAll.set(i, [[a, b]]); };
  for (const [k, z] of roadZones) for (const [a, b] of z) addZone(roadIdx[k]!, a, b);
  // Bridge kerbs: full width along the whole bridge; the transition to the normal kerb (width and colour) lies on the road that
  // leads to the bridge, so it is found as the line that ends at the bridge end (a straight run-out when there is none).
  const ends = new Map<string, { li: number; atStart: boolean }[]>();
  const CELL = 4;
  const cellOf = (p: XY) => `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`;
  lines.forEach(({ r, pts }, li) => {
    if (PATH_CLASSES.includes(r.cls)) return;
    for (const [p, atStart] of [[pts[0]!, true], [pts[pts.length - 1]!, false]] as [XY, boolean][]) {
      const k = cellOf(p), l = ends.get(k);
      if (l) l.push({ li, atStart }); else ends.set(k, [{ li, atStart }]);
    }
  });
  const runOut = (li: number, e: XY, dir: XY): XY[] => {
    const me = lines[li]!;
    let best: { li: number; atStart: boolean } | undefined, bd = 3;
    const cx = Math.floor(e[0] / CELL), cy = Math.floor(e[1] / CELL);
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (const c of ends.get(`${x},${y}`) ?? []) {
      const o = lines[c.li]!;
      if (c.li === li || o.r.level >= me.r.level) continue;
      const q = c.atStart ? o.pts[0]! : o.pts[o.pts.length - 1]!;
      const d = Math.hypot(q[0] - e[0], q[1] - e[1]);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) {
      const o = lines[best.li]!.pts;
      return takeFromStart(best.atStart ? o : [...o].reverse(), TAPER);
    }
    return [e, [e[0] + dir[0] * TAPER, e[1] + dir[1] * TAPER]];
  };
  const kerbs: Feature<Polygon, { lv: number; c: string }>[] = [];
  lines.forEach(({ r, pts, spec }, li) => {
    if (r.level < 1 || pts.length < 2 || PATH_CLASSES.includes(r.cls)) return;
    const unit = (a: XY, b: XY): XY => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
    const n = pts.length;
    const head = runOut(li, pts[0]!, unit(pts[1]!, pts[0]!)); // leads away from the bridge start
    const tail = runOut(li, pts[n - 1]!, unit(pts[n - 2]!, pts[n - 1]!));
    const center: XY[] = [...head.slice(1).reverse(), ...pts, ...tail.slice(1)];
    const from = lineLength([...head.slice(1).reverse(), pts[0]!]);
    const to = from + lineLength(pts);
    for (const q of kerbStrips(center, spec.w / 2, from, to, BRIDGE_KERB / 2, GROUND_KERB / 2, TAPER)) {
      kerbs.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [q.ring.map(fr.from)] }, properties: { lv: r.level, c: lerpColour(KERB_BRIDGE, KERB_GROUND, q.t) } });
    }
  });
  // Zebra crossings where a footway crosses a street on the same level, along the footway (the layer drops those that OpenStreetMap maps itself)
  const CROSSED = new Set(['minor', 'tertiary', 'secondary', 'primary', 'trunk']);
  const roadList = lines.map((l, i) => ({ l, i })).filter(({ l }) => CROSSED.has(l.r.cls));
  const footList = lines.filter((l) => l.r.cls === 'foot');
  const zebras: Feature<MultiPolygon, { lv: number; mid: number[] }>[] = [];
  for (const c of pathCrossings(footList.map((l) => ({ pts: l.pts, level: l.r.level })), roadList.map(({ l }) => ({ pts: l.pts, level: l.r.level })))) {
    const road = roadList[c.road]!.l;
    const stripes = zebraStripes(c.p, c.dir, c.tan, road.spec.w / 2);
    if (!stripes.length) continue;
    // the markings of the street stop around the crossing (the band reaches further along the street when the footway is slanted)
    const along = 1.5 + ((road.spec.w / 2) * Math.abs(c.dir[0] * c.tan[0] + c.dir[1] * c.tan[1])) / Math.max(0.3, Math.abs(c.dir[1] * c.tan[0] - c.dir[0] * c.tan[1])) + 0.8;
    addZone(roadList[c.road]!.i, c.roadS - along, c.roadS + along);
    zebras.push({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: stripes.map((p) => [[...p, p[0]!].map(fr.from)]) }, properties: { lv: road.r.level, mid: fr.from(c.p) } });
  }
  // Oneway arrows, placed here (not by the renderer) so that they only appear where there is space: not at junctions,
  // not on a crossing; and the dashes of a centre line stop around them.
  const arrows: Feature<Point, { rot: number; lv: number }>[] = [];
  const ARROW_CLASSES = new Set(['primary', 'secondary', 'tertiary', 'minor']);
  const clear = (i: number, s: number, r: number) => !(zonesAll.get(i) ?? []).some(([a, b]) => a < s + r && b > s - r);
  lines.forEach(({ r, pts }, i) => {
    if (r.oneway === 0 || r.level < 0 || !ARROW_CLASSES.has(r.cls)) return;
    const total = lineLength(pts);
    for (let s = Math.min(18, total / 2); s < total - 6; s += 36) {
      if (!clear(i, s, 2.6)) continue;
      const at = pointAlong(pts, s);
      if (!at) continue;
      addZone(i, s - 2.4, s + 2.4);
      arrows.push({ type: 'Feature', geometry: { type: 'Point', coordinates: fr.from(at.p) }, properties: { rot: Math.round((at.bearing + (r.oneway < 0 ? 180 : 0)) % 360), lv: r.level } });
    }
  });
  const marks: Feature<LineString, { mid: Mid; lv: number }>[] = [];
  lines.forEach(({ r: r0, pts, spec }, i) => {
    if (!spec.mid || r0.level < 0) return;
    for (const part of cutLine(pts, zonesAll.get(i) ?? [], 3)) marks.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: part.map(fr.from) }, properties: { mid: spec.mid, lv: r0.level } });
  });
  return { arrows: { type: 'FeatureCollection', features: arrows }, zebras: { type: 'FeatureCollection', features: zebras }, kerbs: { type: 'FeatureCollection', features: kerbs }, roads: { type: 'FeatureCollection', features: roads }, marks: { type: 'FeatureCollection', features: marks } };
}
