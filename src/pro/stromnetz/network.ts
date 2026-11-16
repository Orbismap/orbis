import type { PowerGridSample, PowerLineSample, PowerTowerSample } from '../../ext/types';
import { DESIGNS, SLOTS, type DesignId, type Slot } from './designs';
import { sagM, spanSegments, wireAltM } from './sag';

// From the loose features of the vector tiles to a connected grid: which towers a line really runs through, which
// tower stands next to which, how each one is oriented, which design it gets, and where every wire of every span
// starts and ends (at the insulators of the two towers). Pure, no map, no three.js.
//
// A line is connected through the towers its vertices sit on (OSM ways run through their tower nodes), never by guessing
// the nearest line to a tower. Tiles cut ways at their edge: the pieces are joined again by their cut ends.

export interface Tower {
  id: string;
  lng: number;
  lat: number;
  design: DesignId;
  /** direction of the line through it in degrees clockwise from north, in [0, 180) */
  heading: number;
  /** uniform scale of the design to the real height */
  scale: number;
  kv: number;
}

export interface Span {
  /** indices into `towers` */
  a: number;
  b: number;
  kv: number;
  /** colour of the strongest line of the span (as the 2D line) */
  color: string;
  /** systems of the line; undefined when untagged */
  circuits?: number;
}

export interface Network {
  towers: Tower[];
  spans: Span[];
}

/** A wire: [lon, lat, altitude above the terrain's zero] points; `earth`: the thin one above the conductors. */
export interface Wire {
  points: [number, number, number][];
  earth: boolean;
  /** '#rrggbb' of the span's line */
  color: string;
}

const M_PER_DEG = 111_320;
/**
 * A tower belongs to a line when it stands this close to it (m). The tiles simplify the line geometry: a pole in the
 * middle of a straight stretch is no vertex any more, so a tower is matched to the line itself, not to its vertices.
 */
const ON_LINE_M = 12;
/** two lines are both on a tower when their distances to it differ by less than this (m): one tower, two ways */
const SHARED_M = 1.5;
/**
 * A span is a shortcut when a tower stands this close (m) to it, between its ends, and is already connected to both. The same
 * way comes from tiles of different detail: in a coarser piece the line is simplified so far that a tower is off it, and
 * that piece connects its neighbours directly.
 */
const SHORTCUT_M = 22;
/** a cut end lies this far (m) from the last tower on its line at least */
const CUT_GAP_M = 6;
/** the longest span that is drawn (m); beyond is a data error or a crossing of something we do not know */
const MAX_SPAN_M = 2500;
/** towers closer than this are one (m) */
const MIN_SPAN_M = 4;
/** the cut ends of one way in two tiles lie this close (m) */
const CUT_JOIN_M = 160;
/** a stretch of line with vertices that are no towers is still one span when it is not longer than this share of the straight way */
const DETOUR = 1.12;

const str = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : typeof v === 'number' ? String(v) : '');
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const spanKey = (i: number, j: number) => (i < j ? `${i}:${j}` : `${j}:${i}`);

/** 0…1, the same for the same id */
export function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/** The design of a tower: the OSM tags first, then voltage and number of systems, and a share of variety by its id. */
export function chooseDesign(tags: Record<string, unknown>, kv: number, circuits: number | undefined, id: string): DesignId {
  const [structure, design, material, type] = [str(tags.structure), str(tags.design), str(tags.material), str(tags.type)];
  const pick = <T,>(items: T[]) => items[Math.min(items.length - 1, Math.floor(hash01(id) * items.length))]!;
  const double = (circuits ?? (kv >= 100 ? 2 : 1)) >= 2;

  if (/donau|two[-_ ]?level|2[-_ ]?level/.test(design)) return 'donau';
  if (/tannen|christmas|three[-_ ]?level|3[-_ ]?level/.test(design)) return 'tannen';
  if (/barrel|tonne|delta/.test(design)) return 'tonne';
  if (/portal|one[-_ ]?level|1[-_ ]?level|horizontal|flat/.test(design)) return 'portal';
  if (/h[-_ ]?frame|twin|double[-_ ]?pole/.test(design)) return 'woodH';
  if (material === 'wood' || structure === 'wood' || material === 'timber') return kv >= 40 ? 'woodH' : 'wood';
  if (material === 'concrete' || structure === 'concrete') return 'concrete';
  const tubular = structure === 'tubular' || structure === 'pole' || type === 'pole' || material === 'steel' || material === 'metal';

  if (kv >= 200) return double ? pick<DesignId>(['donau', 'donau', 'tannen']) : pick<DesignId>(['tonne', 'portal']);
  if (kv >= 100) {
    if (double) return tubular ? 'tubular3' : pick<DesignId>(['donau', 'tubular3', 'donau']);
    return tubular ? pick<DesignId>(['tubular3', 'woodH']) : pick<DesignId>(['tonne', 'portal', 'woodH']);
  }
  if (kv >= 50) return double ? 'tubular3' : tubular ? 'tubular1' : pick<DesignId>(['woodH', 'tubular1']);
  if (kv >= 20) return tubular ? 'tubular1' : pick<DesignId>(['concrete', 'tubular1', 'wood']);
  if (structure === 'lattice' || type === 'tower') return 'portal';
  return tubular ? 'tubular1' : pick<DesignId>(['wood', 'concrete', 'wood']);
}

/** Uniform scale of a design to the tower's height: the OSM `height` when tagged, else typical for the voltage, with some variety. */
export function towerScale(tags: Record<string, unknown>, design: DesignId, kv: number, id: string): number {
  const spec = DESIGNS[design];
  const tagged = num(tags.height);
  if (tagged !== undefined && tagged >= 4 && tagged <= 150) return Math.max(0.5, Math.min(2.2, tagged / spec.h));
  const lattice = spec.body.kind === 'lattice' || spec.body.kind === 'portal';
  const byVoltage = lattice ? (kv >= 300 ? 1.02 : kv >= 200 ? 0.9 : kv >= 100 ? 0.72 : 0.6) : design === 'tubular3' ? (kv >= 100 ? 1.05 : 0.88) : 1;
  return byVoltage * (0.92 + 0.16 * hash01(`h${id}`));
}

interface Hint {
  kv: number;
  circuits?: number;
  /** direction of the line at the tower (unit vector, east / north) */
  dx: number;
  dy: number;
}

/** Builds the network of towers and spans from what the channel carries. */
export function buildNetwork(samples: readonly PowerGridSample[]): Network {
  const towerSamples: PowerTowerSample[] = [];
  const lineSamples: PowerLineSample[] = [];
  const seen = new Set<string>();
  for (const s of samples) {
    if (s.kind === 'tower') {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      towerSamples.push(s);
    } else lineSamples.push(s);
  }
  if (!towerSamples.length) return { towers: [], spans: [] };

  // metres on a plane around the first tower: good for a viewport
  const lat0 = towerSamples[0]!.lat;
  const lng0 = towerSamples[0]!.lng;
  const kLon = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  const px = (lng: number) => (lng - lng0) * kLon;
  const py = (lat: number) => (lat - lat0) * M_PER_DEG;
  const pos = towerSamples.map((t) => [px(t.lng), py(t.lat)] as const);

  const CELL = 32;
  const grid = new Map<string, number[]>();
  const cellOf = (x: number, y: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  pos.forEach(([x, y], i) => {
    const k = cellOf(x, y);
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  });
  /** the towers whose cell touches the box around a segment (a superset of those within `ON_LINE_M` of it) */
  const towersNear = (x0: number, y0: number, x1: number, y1: number, reach = ON_LINE_M): number[] => {
    const out: number[] = [];
    const [cx0, cx1] = [Math.floor((Math.min(x0, x1) - reach) / CELL), Math.floor((Math.max(x0, x1) + reach) / CELL)];
    const [cy0, cy1] = [Math.floor((Math.min(y0, y1) - reach) / CELL), Math.floor((Math.max(y0, y1) + reach) / CELL)];
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) out.push(...(grid.get(`${cx},${cy}`) ?? []));
    return out;
  };
  const dist = (i: number, j: number) => Math.hypot(pos[i]![0] - pos[j]![0], pos[i]![1] - pos[j]![1]);

  interface SpanAcc { a: number; b: number; kv: number; color: string; ways: Map<string, number | undefined> }
  const spans = new Map<string, SpanAcc>();
  const hints = new Map<number, Hint[]>();
  const connect = (i: number, j: number, line: PowerLineSample) => {
    if (i === j) return;
    const d = dist(i, j);
    if (d < MIN_SPAN_M || d > MAX_SPAN_M) return;
    const [a, b] = i < j ? [i, j] : [j, i];
    const key = spanKey(a, b);
    let span = spans.get(key);
    if (!span) {
      span = { a, b, kv: -1, color: line.color, ways: new Map() };
      spans.set(key, span);
    }
    if (line.voltageKv > span.kv) {
      span.kv = line.voltageKv;
      span.color = line.color;
    }
    // the same way comes once per tile that holds it: one contribution per way
    if (!span.ways.has(line.id)) span.ways.set(line.id, line.circuits);
  };


  // 1. every piece of line: the towers within reach of it, with the place along it (s) and the distance to it (d)
  interface Fit { tower: number; s: number; d: number; dx: number; dy: number }
  interface Piece { line: PowerLineSample; pts: (readonly [number, number])[]; length: number; fits: Fit[] }
  const pieces: Piece[] = lineSamples.map((line) => {
    const pts = line.points.map(([lng, lat]) => [px(lng), py(lat)] as const);
    const best = new Map<number, Fit>();
    let along = 0;
    for (let k = 1; k < pts.length; k++) {
      const [a, b] = [pts[k - 1]!, pts[k]!];
      const [vx, vy] = [b[0] - a[0], b[1] - a[1]];
      const seg = Math.hypot(vx, vy);
      if (seg > 0) {
        for (const i of towersNear(a[0], a[1], b[0], b[1])) {
          const t = Math.max(0, Math.min(1, ((pos[i]![0] - a[0]) * vx + (pos[i]![1] - a[1]) * vy) / (seg * seg)));
          const d = Math.hypot(pos[i]![0] - (a[0] + vx * t), pos[i]![1] - (a[1] + vy * t));
          const prev = best.get(i);
          if (d <= ON_LINE_M && (!prev || d < prev.d)) best.set(i, { tower: i, s: along + t * seg, d, dx: vx / seg, dy: vy / seg });
        }
      }
      along += seg;
    }
    return { line, pts, length: along, fits: [...best.values()] };
  });

  // 2. a tower belongs to the line it is closest to (and to any other way as close, as on two ways over the same towers)
  const nearestWay = new Map<number, number>();
  const wayDist = new Map<string, number>();
  for (const piece of pieces) {
    for (const f of piece.fits) {
      const key = `${piece.line.id}|${f.tower}`;
      const d = Math.min(wayDist.get(key) ?? Infinity, f.d);
      wayDist.set(key, d);
      nearestWay.set(f.tower, Math.min(nearestWay.get(f.tower) ?? Infinity, d));
    }
  }

  /** the open ends of lines that were cut off by a tile edge: the last tower, where the cut is */
  interface Cut { way: string; tower: number; x: number; y: number; line: PowerLineSample }
  const cuts: Cut[] = [];

  // 3. along each piece the towers in order: neighbours are connected
  for (const { line, pts, length, fits } of pieces) {
    const members = fits.filter((f) => wayDist.get(`${line.id}|${f.tower}`)! <= nearestWay.get(f.tower)! + SHARED_M).sort((u, v) => u.s - v.s);
    let prev: Fit | null = null;
    for (const m of members) {
      const list = hints.get(m.tower) ?? [];
      list.push({ kv: line.voltageKv, ...(line.circuits !== undefined ? { circuits: line.circuits } : {}), dx: m.dx, dy: m.dy });
      hints.set(m.tower, list);
      // towers that are not in a row along the line (a detour between them) are no neighbours
      if (prev && prev.tower !== m.tower && m.s - prev.s <= dist(prev.tower, m.tower) * DETOUR + 3) connect(prev.tower, m.tower, line);
      prev = m;
    }
    const [first, last] = [members[0], members[members.length - 1]];
    if (first && first.s > CUT_GAP_M) cuts.push({ way: line.id, tower: first.tower, x: pts[0]![0], y: pts[0]![1], line });
    if (last && length - last.s > CUT_GAP_M) cuts.push({ way: line.id, tower: last.tower, x: pts[pts.length - 1]![0], y: pts[pts.length - 1]![1], line });
  }

  // A tile edge cuts a way in two pieces; each ends in a vertex that is no tower. Two cut ends of one way that lie
  // together, and whose towers are on the two sides of the cut, are the same span.
  const used = new Set<number>();
  for (let i = 0; i < cuts.length; i++) {
    if (used.has(i)) continue;
    const ci = cuts[i]!;
    let best = -1;
    let bestD = CUT_JOIN_M;
    for (let j = i + 1; j < cuts.length; j++) {
      const cj = cuts[j]!;
      if (used.has(j) || cj.way !== ci.way || cj.tower === ci.tower) continue;
      const d = Math.hypot(cj.x - ci.x, cj.y - ci.y);
      if (d >= bestD) continue;
      // each cut lies on its tower's side towards the other tower
      const toward = (c: Cut, other: number) => (c.x - pos[c.tower]![0]) * (pos[other]![0] - pos[c.tower]![0]) + (c.y - pos[c.tower]![1]) * (pos[other]![1] - pos[c.tower]![1]);
      if (toward(ci, cj.tower) <= 0 || toward(cj, ci.tower) <= 0) continue;
      best = j;
      bestD = d;
    }
    if (best >= 0) {
      used.add(i);
      used.add(best);
      connect(ci.tower, cuts[best]!.tower, ci.line);
    }
  }

  // The coarse pieces of a way skip towers that its fine pieces connect: drop those shortcuts.
  const shortcuts: string[] = [];
  for (const [key, sp] of spans) {
    const [a, b] = [pos[sp.a]!, pos[sp.b]!];
    const [vx, vy] = [b[0] - a[0], b[1] - a[1]];
    const len2 = vx * vx + vy * vy;
    for (const c of towersNear(a[0], a[1], b[0], b[1], SHORTCUT_M)) {
      if (c === sp.a || c === sp.b) continue;
      const t = ((pos[c]![0] - a[0]) * vx + (pos[c]![1] - a[1]) * vy) / len2;
      if (t <= 0.02 || t >= 0.98) continue;
      if (Math.hypot(pos[c]![0] - (a[0] + vx * t), pos[c]![1] - (a[1] + vy * t)) > SHORTCUT_M) continue;
      if (spans.has(spanKey(sp.a, c)) && spans.has(spanKey(c, sp.b))) {
        shortcuts.push(key);
        break;
      }
    }
  }
  for (const key of shortcuts) spans.delete(key);

  // Towers: the ones on the network keep their order, the others stay as they are (a lonely pole is a pole).
  const neighbours = new Map<number, { j: number; kv: number }[]>();
  for (const s of spans.values()) {
    for (const [i, j] of [[s.a, s.b], [s.b, s.a]] as const) {
      const list = neighbours.get(i) ?? [];
      list.push({ j, kv: s.kv });
      neighbours.set(i, list);
    }
  }

  const towers: Tower[] = towerSamples.map((t, i) => {
    const hs = hints.get(i) ?? [];
    const near = neighbours.get(i) ?? [];
    const kv = Math.max(0, ...hs.map((h) => h.kv), ...near.map((n) => n.kv));
    const tagged = hs.map((h) => h.circuits).filter((c): c is number => c !== undefined);
    const design = chooseDesign(t.tags, kv, tagged.length ? Math.max(...tagged) : undefined, t.id);
    return { id: t.id, lng: t.lng, lat: t.lat, design, heading: headingOf(i, near, hs, pos), scale: towerScale(t.tags, design, kv, t.id), kv };
  });

  const out: Span[] = [...spans.values()].map((s) => {
    const tagged = [...s.ways.values()].filter((c): c is number => c !== undefined);
    // untagged ways count as one system each when another way of the span is tagged
    const circuits = tagged.length ? [...s.ways.values()].reduce<number>((n, c) => n + (c ?? 1), 0) : undefined;
    return { a: s.a, b: s.b, kv: Math.max(0, s.kv), color: s.color, ...(circuits !== undefined ? { circuits: Math.min(6, circuits) } : {}) };
  });
  return { towers, spans: out };
}

/** Direction of the line through a tower, in [0, 180): the bisector of the two strongest lines, else the one line. */
function headingOf(i: number, near: { j: number; kv: number }[], hints: Hint[], pos: readonly (readonly [number, number])[]): number {
  const unit = (j: number): [number, number] => {
    const [dx, dy] = [pos[j]![0] - pos[i]![0], pos[j]![1] - pos[i]![1]];
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  let vec: [number, number] | null = null;
  if (near.length) {
    const top = Math.max(...near.map((n) => n.kv));
    const strong = near.filter((n) => n.kv >= top - 1e-6).map((n) => unit(n.j));
    if (strong.length === 1) vec = strong[0]!;
    else {
      // the two lines that run the most opposite: in from one, out to the other
      let best = Infinity;
      for (let a = 0; a < strong.length; a++) {
        for (let b = a + 1; b < strong.length; b++) {
          const dot = strong[a]![0] * strong[b]![0] + strong[a]![1] * strong[b]![1];
          if (dot >= best) continue;
          best = dot;
          const sum: [number, number] = [strong[b]![0] - strong[a]![0], strong[b]![1] - strong[a]![1]];
          vec = Math.hypot(sum[0], sum[1]) > 0.25 ? sum : strong[b]!;
        }
      }
    }
  } else if (hints.length) {
    const h = hints.reduce((m, c) => (c.kv > m.kv ? c : m));
    vec = [h.dx, h.dy];
  }
  if (!vec) return 0;
  return (((Math.atan2(vec[0], vec[1]) * 180) / Math.PI) % 180 + 180) % 180;
}

/** Where a slot of a tower is: lon, lat and altitude (`ground` + height). */
export function slotPosition(t: Tower, slot: Slot, ground: number): [number, number, number] {
  const h = (t.heading * Math.PI) / 180;
  const x = slot.x * t.scale;
  const east = x * Math.cos(h);
  const north = -x * Math.sin(h);
  return [t.lng + east / (M_PER_DEG * Math.cos((t.lat * Math.PI) / 180)), t.lat + north / M_PER_DEG, ground + slot.z * t.scale];
}

/** The wires of a span: every conductor from an insulator of one tower to the matching insulator of the other, plus the earth wires. */
export function spanWires(a: Tower, b: Tower, span: Span, groundA: number, groundB: number): Wire[] {
  const [da, db] = [DESIGNS[a.design], DESIGNS[b.design]];
  const used = Math.min(span.circuits ?? 2, da.circuits, db.circuits);
  const kLon = M_PER_DEG * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const [dx, dy] = [(b.lng - a.lng) * kLon, (b.lat - a.lat) * M_PER_DEG];
  const len = Math.hypot(dx, dy) || 1;
  // left of the span's direction
  const left: [number, number] = [-dy / len, dx / len];

  /** the attachment points of a tower for this span, ordered across the span (left to right), then bottom to top */
  const attach = (t: Tower, ground: number, earth: boolean) =>
    SLOTS[t.design]
      .filter((s) => s.earth === earth && (earth || s.circuit < used))
      .map((s) => {
        const p = slotPosition(t, s, ground);
        const across = ((p[0] - a.lng) * kLon) * left[0] + ((p[1] - a.lat) * M_PER_DEG) * left[1];
        return { p, across, z: s.z };
      })
      .sort((u, v) => u.across - v.across || u.z - v.z);

  const wires: Wire[] = [];
  for (const earth of [false, true]) {
    const [pa, pb] = [attach(a, groundA, earth), attach(b, groundB, earth)];
    const n = Math.min(pa.length, pb.length);
    for (let k = 0; k < n; k++) {
      const [p, q] = [pa[k]!.p, pb[k]!.p];
      const span2 = Math.hypot((q[0] - p[0]) * kLon, (q[1] - p[1]) * M_PER_DEG);
      const clearance = Math.min(p[2] - groundA, q[2] - groundB);
      const sag = sagM(span2, span.kv, 0.5 * clearance, earth);
      const segments = spanSegments(span2);
      const points: [number, number, number][] = [];
      for (let s = 0; s <= segments; s++) {
        const t = s / segments;
        points.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, wireAltM(p[2], q[2], sag, t)]);
      }
      wires.push({ points, earth, color: span.color });
    }
  }
  return wires;
}
