// Road markings mapped in OpenStreetMap (Overpass `out body geom`): zebra crossings, marked crossings, explicit line
// markings (road_marking), no-overtaking lines, traffic islands, plus markings DERIVED from road tags: stop and give-way
// lines at signals/signs, turn arrows from turn:lanes, and multi-lane roads (surface, lane dividers).
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';
import { cutLine, localFrame, smooth } from '../../render/roadgeom';

export type MarkKind = 'zebra' | 'cross' | 'marking' | 'over' | 'island' | 'stop' | 'giveway' | 'arrow' | 'surf' | 'lane' | 'centre';
export type MarkProps = {
  id: string; kind: MarkKind; dash: boolean; title: string; marking: string; url: string;
  /** surf: width in metres */
  w: number;
  /** lane/centre: line offset in metres, positive = right of the line direction */
  off: number;
  /** arrow: icon key (l, s, r, ls, sr, lr, lsr) and heading in degrees clockwise from north */
  icon: string; rot: number;
  /** road level from the layer tag: 0 ground, 1 and 2 raised (bridges) */
  lv: number;
};

const ROADS = '(motorway|trunk|primary|secondary|tertiary)(_link)?|unclassified|residential|living_street|service';
const bbox = (s: number, w: number, n: number, e: number) => `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;
const HW = `["highway"~"^(${ROADS})$"]`;
// Two lighter requests instead of one heavy one (dense cities such as Manhattan time out otherwise); both go through overpassRoadmarks.
/** Mapped markings and crossings: crossing ways, crossing points with the roads they sit on, lines, islands. */
export const markQuery = (s: number, w: number, n: number, e: number): string => {
  const bb = bbox(s, w, n, e);
  return `[out:json][timeout:40];`
    + `(way["crossing"~"^(zebra|marked|uncontrolled|traffic_signals|lines|dash|dash_left|dash_right|dots|bar)$"](${bb});way["crossing:markings"](${bb});way["road_marking"](${bb});way["highway"]["overtaking"~"^(no|reverse|opposite)$"](${bb});way["traffic_island"](${bb}););out body geom 7000;`
    + `node["highway"="crossing"]["crossing"!~"^(no|unmarked)$"](${bb})->.cn;way(bn.cn)${HW};out body geom 5000;.cn out body 7000;`;
};
/** Roads with lane information and stop/give-way/signal points. */
export const laneQuery = (s: number, w: number, n: number, e: number): string => {
  const bb = bbox(s, w, n, e);
  return `[out:json][timeout:40];`
    + `node["highway"~"^(traffic_signals|stop|give_way)$"](${bb})->.sg;way(bn.sg)${HW}->.sw;`
    + `(.sw;way${HW}["turn:lanes"](${bb});way${HW}["turn:lanes:forward"](${bb});way${HW}["turn:lanes:backward"](${bb});way${HW}["lanes"~"^([3-9]|1[0-9])$"](${bb}););out body geom 7000;`
    + `.sg out body 5000;`;
};

/** How a crossing is painted: stripes ('zebra': zebra, ladder, ...), lines ('cross': dashed edges) or not at all. */
export function crossingStyle(t: Record<string, string>): 'zebra' | 'cross' | undefined {
  const cm = t['crossing:markings'];
  if (cm) return cm === 'no' ? undefined : /^(zebra|ladder|bar|yes|rainbow|pictogram)/.test(cm) ? 'zebra' : 'cross';
  const c = t.crossing ?? '';
  if (/^(zebra|marked|uncontrolled|bar)$/.test(c)) return 'zebra';
  if (/^(traffic_signals|lines|dash|dash_left|dash_right|dots)$/.test(c)) return 'cross';
  return undefined;
}

const MOTOR = new RegExp(`^(${ROADS})$`);
const LANE_W = 3.2;

type P = [number, number];
type El = { type: string; id: number; lat?: number; lon?: number; tags?: Record<string, string>; nodes?: number[]; geometry?: { lat: number; lon: number }[] };

// --- small geodesy on a local flat plane (metres) ---------------------------------------------------------------------
const RAD = Math.PI / 180;
const M_LAT = 111320;
const dist = (a: P, b: P) => Math.hypot((b[0] - a[0]) * Math.cos(a[1] * RAD) * M_LAT, (b[1] - a[1]) * M_LAT);
const bearing = (a: P, b: P) => (Math.atan2((b[0] - a[0]) * Math.cos(a[1] * RAD), b[1] - a[1]) / RAD + 360) % 360;
const move = (p: P, brg: number, m: number): P => [p[0] + (m * Math.sin(brg * RAD)) / (M_LAT * Math.cos(p[1] * RAD)), p[1] + (m * Math.cos(brg * RAD)) / M_LAT];

/** The point `m` metres back from the end of a line (travelling towards its end) and the heading there. */
export function backFromEnd(pts: P[], m: number): { p: P; brg: number } | undefined {
  let left = m;
  for (let i = pts.length - 1; i > 0; i--) {
    const a = pts[i - 1]!, b = pts[i]!, len = dist(a, b);
    if (len >= left && len > 0) { const f = left / len; return { p: [b[0] + (a[0] - b[0]) * f, b[1] + (a[1] - b[1]) * f], brg: bearing(a, b) }; }
    left -= len;
  }
  return undefined;
}

/** Rough check for countries that drive on the left (UK/IE, Japan, Australia/NZ, South Asia, southern Africa, SE Asia). */
export function leftHandTraffic(lon: number, lat: number): boolean {
  const inBox = (w: number, s: number, e: number, n: number) => lon >= w && lon <= e && lat >= s && lat <= n;
  return inBox(-10.7, 50, 1.8, 60.9) || inBox(129.5, 30, 146, 46) || inBox(123, 24, 131, 28.5) || inBox(112, -48, 179, -10)
    || inBox(70, 5, 92, 35) || inBox(11, -35, 41, -17) || inBox(97.3, 5.6, 105.7, 20.5) || inBox(95, -11, 141, 6.5);
}

// --- road tags --------------------------------------------------------------------------------------------------------
interface Road { lv: number; id: number; t: Record<string, string>; pts: P[]; nodes: number[]; one: 0 | 1 | -1; total: number; fwd: number; back: number; lht: boolean }
const int = (v: string | undefined) => { const n = parseInt(v ?? '', 10); return Number.isFinite(n) && n > 0 ? n : 0; };

function toRoad(el: El): Road | undefined {
  const t = el.tags ?? {};
  if (el.tags?.tunnel && el.tags.tunnel !== 'no' && el.tags.tunnel !== 'building_passage') return undefined; // tunnels are drawn by the tile layers
  if (el.type !== 'way' || !MOTOR.test(t.highway ?? '') || !el.geometry || el.geometry.length < 2 || !el.nodes || el.nodes.length !== el.geometry.length) return undefined;
  const pts = el.geometry.map((p) => [p.lon, p.lat] as P);
  const o = t.oneway;
  let one: 0 | 1 | -1 = 0;
  if (o === '-1' || o === 'reverse') one = -1;
  else if (o === 'yes' || o === '1' || o === 'true') one = 1;
  else if (o !== 'no' && (t.junction === 'roundabout' || t.highway === 'motorway' || t.highway === 'motorway_link')) one = 1;
  const big = /^(motorway|trunk)/.test(t.highway!);
  const lht = leftHandTraffic(pts[0]![0], pts[0]![1]);
  const fwdN = int(t['lanes:forward']), backN = int(t['lanes:backward']);
  const turnN = (v: string | undefined) => (v ? v.split('|').length : 0);
  let total = int(t.lanes), fwd = 0, back = 0;
  if (one) {
    total ||= fwdN || turnN(t['turn:lanes']) || turnN(t['turn:lanes:forward']) || (big ? 2 : 1);
    fwd = total;
  } else {
    if (fwdN && backN) { fwd = fwdN; back = backN; total = fwd + back; }
    else {
      total ||= (fwdN + backN) || 2;
      fwd = fwdN || Math.max(1, Math.floor(total / 2)); back = backN || Math.max(1, total - fwd);
      if (!fwdN && !backN && total % 2) back = total - fwd; // odd without detail: split, a middle lane stays ambiguous
    }
  }
  const lay = Math.max(-1, Math.min(2, Math.round(Number(t.layer)) || 0));
  const lv = t.bridge && t.bridge !== 'no' ? Math.max(1, lay) : lay;
  if (lv < 0) return undefined; // below ground: drawn by the tile layers
  return { lv, id: el.id, t, pts, nodes: el.nodes, one, total, fwd, back, lht };
}

/** Per-lane arrow keys of a `turn:lanes` value, left to right in the direction of travel ('' = no arrow for that lane). */
export function laneArrows(v: string | undefined): string[] {
  if (!v) return [];
  return v.split('|').map((lane) => {
    const set = new Set<string>();
    for (const tok of lane.split(';')) {
      const k = tok.trim();
      if (k === '' || k === 'none' || k === 'through') set.add('s');
      else if (/^(slight_|sharp_)?left$/.test(k)) set.add('l');
      else if (/^(slight_|sharp_)?right$/.test(k)) set.add('r');
    }
    return ['l', 's', 'r'].filter((c) => set.has(c)).join('');
  });
}

export function overpassRoadmarks(raw: unknown): FeatureCollection<LineString | Polygon | Point, MarkProps> {
  const els = ((raw as { elements?: El[] } | null)?.elements ?? []) as El[];
  const features: Feature<LineString | Polygon | Point, MarkProps>[] = [];
  const base = (id: string, kind: MarkKind, title: string, url: string): MarkProps => ({ id, kind, dash: false, title, marking: '', url, w: 0, off: 0, icon: '', rot: 0, lv: 0 });
  /** A line feature, smoothed; with `cuts` (arc-length zones in metres) it is split around them first. */
  const line = (props: MarkProps, coords: P[], cuts?: [number, number][]) => {
    const fr = localFrame(coords[0]![0], coords[0]![1]);
    const local = coords.map((c) => fr.to(c));
    const parts = cuts?.length ? cutLine(local, cuts, 3) : [local];
    for (const part of parts) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: smooth(part).map(fr.from) }, properties: props });
  };
  const way = (id: number) => `https://www.openstreetmap.org/way/${id}`;

  // 1) mapped markings
  for (const el of els) {
    const t = el.tags ?? {};
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
    const coords = el.geometry.map((p) => [p.lon, p.lat] as [number, number]);
    const last = coords[coords.length - 1]!;
    const closed = coords.length >= 4 && coords[0]![0] === last[0] && coords[0]![1] === last[1];
    let kind: MarkKind, dash = false, title: string;
    const cs = crossingStyle(t);
    if (cs === 'zebra') { kind = 'zebra'; title = 'Zebrastreifen'; }
    else if (cs === 'cross') { kind = 'cross'; dash = true; title = 'Markierte Querungsanlage'; }
    else if (t.road_marking) { kind = 'marking'; dash = /dash|broken/i.test(t['road_marking:stroke'] ?? t.road_marking); title = 'Bodenmarkierung'; }
    else if (t.overtaking && /^(no|reverse|opposite)$/.test(t.overtaking)) { kind = 'over'; title = 'Überholverbot'; }
    else if (t.traffic_island) { kind = 'island'; title = 'Verkehrsinsel'; }
    else continue;
    features.push({
      type: 'Feature',
      geometry: closed && kind === 'island' ? { type: 'Polygon', coordinates: [coords] } : { type: 'LineString', coordinates: coords },
      properties: { ...base(`w${el.id}`, kind, title, way(el.id)), dash, marking: t.road_marking ?? '' },
    });
  }

  // 2) markings derived from road tags
  const roads: Road[] = [];
  const seen = new Set<number>();
  for (const el of els) {
    if (seen.has(el.id)) continue;
    const r = toRoad(el);
    if (r) { seen.add(el.id); roads.push(r); }
  }
  const touch = new Map<number, number>();
  for (const r of roads) for (const n of new Set(r.nodes)) touch.set(n, (touch.get(n) ?? 0) + 1);

  for (const r of roads) {
    const sign = r.lht ? -1 : 1; // side of the line on which forward traffic runs
    const url = way(r.id);
    // multi-lane roads: own surface, edges, lane dividers (the basemap-derived rendering only knows 1-2 lanes)
    if (r.total >= 3) {
      const W = r.total * LANE_W + 0.6;
      const surf = base(`s${r.id}`, 'surf', 'Fahrbahn', url); surf.w = W; surf.lv = r.lv; surf.marking = `${r.total} Fahrstreifen`;
      line(surf, r.pts);
      // lane lines stop around junctions (the ends of the way and nodes shared with other fetched roads)
      const cuts: [number, number][] = [];
      let s = 0;
      r.pts.forEach((p, i) => {
        if (i) s += dist(r.pts[i - 1]!, p);
        if (i === 0 || i === r.pts.length - 1 || (touch.get(r.nodes[i]!) ?? 0) > 1) cuts.push([s - 7, s + 7]);
      });
      const offs: { off: number; centre?: boolean }[] = [];
      if (r.one) for (let k = 1; k < r.total; k++) offs.push({ off: (k - r.total / 2) * LANE_W });
      else {
        offs.push({ off: 0, centre: true });
        for (let k = 1; k < r.fwd; k++) offs.push({ off: sign * k * LANE_W });
        for (let k = 1; k < r.back; k++) offs.push({ off: -sign * k * LANE_W });
      }
      for (const o of offs) {
        const f = base(`l${r.id}${o.off}`, o.centre ? 'centre' : 'lane', 'Fahrstreifen', url);
        f.off = o.off; f.lv = r.lv; f.dash = !o.centre; line(f, r.pts, cuts);
      }
    }
    // turn arrows at the end of the approach
    const dirs: { v: string | undefined; pts: P[]; n: number; fwd: boolean }[] = [];
    if (r.one) {
      const v = r.t['turn:lanes'] ?? r.t['turn:lanes:forward'];
      dirs.push({ v, pts: r.one === 1 ? r.pts : [...r.pts].reverse(), n: r.total, fwd: true });
    } else {
      dirs.push({ v: r.t['turn:lanes:forward'], pts: r.pts, n: r.fwd, fwd: true });
      dirs.push({ v: r.t['turn:lanes:backward'], pts: [...r.pts].reverse(), n: r.back, fwd: false });
    }
    for (const d of dirs) {
      const arrows = laneArrows(d.v);
      if (!arrows.length) continue;
      const n = arrows.length;
      const at = backFromEnd(d.pts, 9);
      if (!at) continue;
      arrows.forEach((icon, i) => {
        if (!icon) return;
        // lanes are numbered left to right in the direction of travel; in right-hand traffic they lie right of the centreline,
        // in left-hand traffic left of it: lateral offset (positive = right of travel)
        const lat = r.one ? (i - (n - 1) / 2) * LANE_W : r.lht ? -((n - 1 - i) + 0.5) * LANE_W : (i + 0.5) * LANE_W;
        const p = move(at.p, at.brg + 90, lat);
        const f = base(`a${r.id}${d.fwd ? 'f' : 'b'}${i}`, 'arrow', 'Fahrstreifenpfeil', url);
        f.icon = icon; f.rot = Math.round(at.brg); f.marking = d.v ?? '';
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: f });
      });
    }
  }

  // stop and give-way lines
  const nodes = new Map<number, El>();
  for (const el of els) if (el.type === 'node' && el.tags && el.lat !== undefined && el.lon !== undefined) nodes.set(el.id, el);

  // crossings mapped only as a point on the road: a zebra (or two stop lines of a signalised crossing) across the road
  const mapped = features.filter((f) => f.properties.kind === 'zebra' || f.properties.kind === 'cross').map((f) => (f.geometry as LineString).coordinates as P[]);
  const nearMapped = (p: P) => mapped.some((cs) => cs.some((c, i) => {
    const a = i ? cs[i - 1]! : c;
    const abx = (c[0] - a[0]) * Math.cos(a[1] * RAD), aby = c[1] - a[1], apx = (p[0] - a[0]) * Math.cos(a[1] * RAD), apy = p[1] - a[1];
    const l2 = abx * abx + aby * aby, t = l2 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / l2)) : 0;
    return dist(p, [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t]) < 6;
  }));
  for (const [nid, node] of nodes) {
    const t = node.tags!;
    const cs = t.highway === 'crossing' ? crossingStyle(t) : undefined;
    if (!cs) continue;
    const at: P = [node.lon!, node.lat!];
    if (nearMapped(at)) continue;
    const r = roads.find((x) => x.nodes.includes(nid));
    if (!r) continue;
    const i = r.nodes.indexOf(nid);
    if (i === 0 || i === r.nodes.length - 1) continue; // at a junction the direction is ambiguous
    const brg = bearing(r.pts[i - 1]!, r.pts[i + 1]!);
    const half = (r.total * LANE_W + 0.8) / 2;
    const url = `https://www.openstreetmap.org/node/${nid}`;
    const across = (shift: number): P[] => { const c = move(at, brg, shift); return [move(c, brg + 90, -half), move(c, brg + 90, half)]; };
    const f = cs === 'zebra' ? base(`z${nid}`, 'zebra', 'Zebrastreifen', url) : base(`c${nid}`, 'cross', 'Markierte Querungsanlage', url);
    f.dash = cs === 'cross'; f.lv = r.lv;
    line(f, across(0));
  }

  // stop and give-way lines
  const done = new Set<string>();
  for (const [nid, node] of nodes) {
    const t = node.tags!;
    const kind = t.highway === 'stop' ? 'stop' : t.highway === 'give_way' ? 'giveway' : t.highway === 'traffic_signals' ? 'stop' : undefined;
    if (!kind) continue;
    const dirTag = t.direction ?? t['traffic_signals:direction'];
    for (const r of roads) {
      const i = r.nodes.indexOf(nid);
      if (i < 0) continue;
      const last = r.nodes.length - 1;
      let approaches: ('f' | 'b')[];
      if (i === last) approaches = ['f'];
      else if (i === 0) approaches = ['b'];
      else if (dirTag === 'forward') approaches = ['f'];
      else if (dirTag === 'backward') approaches = ['b'];
      else if (kind === 'stop' && t.highway === 'traffic_signals') approaches = ['f', 'b'];
      else approaches = [i > last / 2 ? 'f' : 'b'];
      for (const a of approaches) {
        if ((a === 'f' && r.one === -1) || (a === 'b' && r.one === 1)) continue;
        const key = `${nid}:${r.id}:${a}`;
        if (done.has(key)) continue;
        done.add(key);
        const pts = a === 'f' ? r.pts.slice(0, i + 1) : r.pts.slice(i).reverse();
        if (pts.length < 2) continue;
        const shift = (touch.get(nid) ?? 1) > 1 ? 6 : 1;
        const at = backFromEnd(pts, Math.min(shift, pts.slice(1).reduce((s, p, k) => s + dist(pts[k]!, p), 0) * 0.9));
        if (!at) continue;
        const n = r.one ? r.total : a === 'f' ? r.fwd : r.back;
        const s = r.lht ? -1 : 1;
        const [from, to] = r.one ? [-(n * LANE_W) / 2, (n * LANE_W) / 2] : [0.2 * s, n * LANE_W * s];
        const f = base(`${kind[0]}${nid}${r.id}${a}`, kind, kind === 'stop' ? 'Haltelinie' : 'Wartelinie', `https://www.openstreetmap.org/node/${nid}`);
        f.dash = kind === 'giveway';
        line(f, [move(at.p, at.brg + 90, from), move(at.p, at.brg + 90, to)]);
      }
    }
  }
  return { type: 'FeatureCollection', features };
}
