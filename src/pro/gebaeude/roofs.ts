import { ShapeUtils, Vector2 } from 'three';

// Walls and roofs of one building from its footprint and its OpenStreetMap tags (Simple 3D Buildings). Pure geometry, no map:
// the footprint is given in metres (x east, y north), the result is flat triangle lists (x, y, z; z up, 0 at the ground).
//
// The idea: almost every roof shape is the LOWER ENVELOPE of a few planes laid over the footprint's bounding rectangle:
//   gabled = two planes, hipped = four, a mansard = a steep and a flat plane per side, a barrel roof = tangent planes of an arc.
// Each footprint triangle is cut where two planes cross, so every piece lies on one plane; this works for any outline (L, U, with
// holes) without a straight skeleton. Walls follow the same envelope along each footprint edge, so gables come out right.
// Round roofs (dome, onion, cone, pyramid on odd outlines) are stacks of shrunken copies of the outline instead.
// Which tags mean what follows https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings.

export type Pt = [number, number];
export type Tags = Record<string, string>;
/** Flat lists of triangles (9 numbers each). */
export interface BuildingMesh { walls: number[]; roof: number[] }

export type RoofShape = 'flat' | 'gabled' | 'hipped' | 'half-hipped' | 'skillion' | 'pyramidal' | 'gambrel' | 'mansard' | 'round' | 'dome' | 'onion' | 'cone';

const LEVEL_H = 3;
const DEFAULT_WALL = 6;
const DEFAULT_ROOF = 3;
const MIN_WALL = 0.5;
const EPS = 1e-6;
const MAX_SPLIT_DEPTH = 14;
const MIN_AREA_M2 = 0.5;
const RAD = Math.PI / 180;

/** OSM `roof:shape` values (and their common spellings) → what is modelled; the rest is a flat roof. */
const SHAPES: Record<string, RoofShape> = {
  flat: 'flat',
  gabled: 'gabled', pitched: 'gabled', saltbox: 'gabled', gabled_row: 'gabled', crosspitched: 'gabled', cross_gabled: 'gabled', gabled_height_moved: 'gabled',
  bellcast_gable: 'gabled', double_saltbox: 'gabled', quadruple_saltbox: 'gabled', 'side_half-hipped': 'gabled', side_hipped: 'gabled',
  hipped: 'hipped', equal_hipped: 'hipped',
  'half-hipped': 'half-hipped', half_hipped: 'half-hipped', 'hipped-and-gabled': 'half-hipped', hipped_and_gabled: 'half-hipped',
  skillion: 'skillion', lean_to: 'skillion', monopitch: 'skillion', shed: 'skillion', sloped: 'skillion', single_pitch: 'skillion',
  pyramidal: 'pyramidal', pyramid: 'pyramidal',
  gambrel: 'gambrel', mansard: 'mansard', round: 'round', arch: 'round',
  dome: 'dome', onion: 'onion', cone: 'cone',
};

export const roofShapeOf = (tags: Tags): RoofShape => SHAPES[(tags['roof:shape'] ?? '').trim().toLowerCase()] ?? 'flat';

/** A length in metres from OSM text: "12", "12,5 m", "40'" or "40' 6\"". */
export function parseLength(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().toLowerCase().replace(',', '.');
  const ft = /^(-?\d+(?:\.\d+)?)\s*(?:'|ft)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in)?)?$/.exec(s);
  if (ft) return Number(ft[1]) * 0.3048 + Number(ft[2] ?? 0) * 0.0254;
  const m = /^(-?\d+(?:\.\d+)?)\s*(?:m|meter|metre|meters|metres)?$/.exec(s);
  return m ? Number(m[1]) : undefined;
}

const count = (v: string | undefined): number | undefined => {
  const n = parseLength(v);
  return n !== undefined && Number.isFinite(n) ? n : undefined;
};

export interface Dimensions {
  shape: RoofShape;
  /** underside of the part, m above the ground */
  base: number;
  /** where the walls end and the roof starts, m above the ground */
  eave: number;
  /** height of the roof above the eave (m) */
  rise: number;
  /** highest point (m) */
  top: number;
}

/** Heights of a building: `height` is the highest point, the roof stands on top of the walls; without tags it is guessed from the levels. */
export function dimensions(tags: Tags): Dimensions {
  const shape = roofShapeOf(tags);
  const roofLevels = count(tags['roof:levels']);
  const roofTag = parseLength(tags['roof:height']) ?? (roofLevels !== undefined ? roofLevels * LEVEL_H : undefined);
  let rise = shape === 'flat' ? 0 : Math.max(0, roofTag ?? DEFAULT_ROOF);
  const levels = count(tags['building:levels']);
  const base = Math.max(0, parseLength(tags.min_height) ?? (count(tags['building:min_level']) ?? 0) * LEVEL_H);
  let top = parseLength(tags.height) ?? parseLength(tags['building:height']) ?? (levels !== undefined ? levels * LEVEL_H + rise : DEFAULT_WALL + rise);
  if (top < base + MIN_WALL) top = base + MIN_WALL;
  rise = Math.min(rise, top - base - MIN_WALL);
  return { shape, base, eave: top - rise, rise, top };
}

// --- plane geometry -------------------------------------------------------------------------------------------------------

/** h = A x + B y + C */
type Plane = [number, number, number];
const at = (pl: Plane, p: Pt) => pl[0] * p[0] + pl[1] * p[1] + pl[2];

const area2 = (r: Pt[]) => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j]![0] * r[i]![1] - r[i]![0] * r[j]![1];
  return s;
};

/** Ring without repeated points and without the closing point; undefined when nothing is left of it. */
function cleanRing(r: Pt[]): Pt[] | undefined {
  const out: Pt[] = [];
  for (const p of r) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-4) out.push(p);
  }
  while (out.length > 1 && Math.hypot(out[0]![0] - out[out.length - 1]![0], out[0]![1] - out[out.length - 1]![1]) <= 1e-4) out.pop();
  return out.length >= 3 ? out : undefined;
}

function convexHull(points: Pt[]): Pt[] {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (list: Pt[]) => {
    const h: Pt[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return build(pts).concat(build(pts.slice().reverse()));
}

interface Frame { ax: Pt; cx: Pt; a0: number; a1: number; b0: number; b1: number }

/**
 * The rectangle a roof is laid over: `ax` along the ridge, `cx` across it (the slope direction). `roof:direction` (compass bearing
 * the slope faces) fixes `cx`; otherwise the smallest rectangle around the outline, ridge along its long side (`roof:orientation=across`
 * turns that by 90°).
 */
function frameOf(outer: Pt[], tags: Tags): Frame {
  const dir = parseLength(tags['roof:direction']) ?? compass(tags['roof:direction']);
  let ax: Pt, cx: Pt;
  if (dir !== undefined) {
    cx = [Math.sin(dir * RAD), Math.cos(dir * RAD)];
    ax = [cx[1], -cx[0]];
  } else {
    let best = Infinity;
    ax = [1, 0];
    cx = [0, 1];
    const hull = convexHull(outer);
    for (let i = 0; i < hull.length; i++) {
      const p = hull[i]!, q = hull[(i + 1) % hull.length]!;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 1e-6) continue;
      const u: Pt = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
      const v: Pt = [-u[1], u[0]];
      const [su, sv] = [span(outer, u), span(outer, v)];
      if (su * sv < best - 1e-9) { best = su * sv; [ax, cx] = su >= sv ? [u, v] : [v, u]; }
    }
    if ((tags['roof:orientation'] ?? '').toLowerCase() === 'across') [ax, cx] = [cx, ax];
  }
  const [a0, a1] = range(outer, ax), [b0, b1] = range(outer, cx);
  return { ax, cx, a0, a1, b0, b1 };
}

const COMPASS: Record<string, number> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315, nne: 22.5, ene: 67.5, ese: 112.5, sse: 157.5, ssw: 202.5, wsw: 247.5, wnw: 292.5, nnw: 337.5 };
const compass = (v: string | undefined): number | undefined => (v === undefined ? undefined : COMPASS[v.trim().toLowerCase()]);
const range = (r: Pt[], u: Pt): [number, number] => {
  let lo = Infinity, hi = -Infinity;
  for (const p of r) { const d = p[0] * u[0] + p[1] * u[1]; if (d < lo) lo = d; if (d > hi) hi = d; }
  return [lo, hi];
};
const span = (r: Pt[], u: Pt) => { const [lo, hi] = range(r, u); return hi - lo; };

/** The planes whose lower envelope is the roof (heights above the eave); empty: flat. */
function roofPlanes(shape: RoofShape, f: Frame, rise: number): Plane[] {
  const hw = (f.b1 - f.b0) / 2, hl = (f.a1 - f.a0) / 2;
  const am = (f.a0 + f.a1) / 2, bm = (f.b0 + f.b1) / 2;
  if (rise <= EPS || hw < 0.05 || hl < 0.05) return [];
  /** plane da * a' + db * b' + c over the centred rectangle coordinates, as a plane over x / y */
  const pl = (da: number, db: number, c: number): Plane => [da * f.ax[0] + db * f.cx[0], da * f.ax[1] + db * f.cx[1], c - da * am - db * bm];
  const H = rise;
  const s = H / hw;
  switch (shape) {
    case 'gabled': return [pl(0, -s, H), pl(0, s, H)];
    case 'hipped': { const se = H / Math.min(hw, hl); return [pl(0, -s, H), pl(0, s, H), pl(-se, 0, se * hl), pl(se, 0, se * hl)]; }
    case 'half-hipped': return [pl(0, -s, H), pl(0, s, H), pl(-s, 0, H / 2 + s * hl), pl(s, 0, H / 2 + s * hl)];
    case 'skillion': return [pl(0, -H / (2 * hw), H / 2)];
    case 'gambrel': {
      const steep = (0.7 * H) / (0.3 * hw), shallow = (0.3 * H) / (0.7 * hw);
      return [pl(0, -steep, steep * hw), pl(0, steep, steep * hw), pl(0, -shallow, H), pl(0, shallow, H)];
    }
    case 'mansard': {
      const hm = Math.min(hw, hl);
      const steep = (0.75 * H) / (0.25 * hm), shallow = (0.25 * H) / (0.75 * hm);
      // distance d from each of the four sides: left b' + hw, right hw - b', ends a' + hl and hl - a'
      const faces: [number, number, number][] = [[0, 1, hw], [0, -1, hw], [1, 0, hl], [-1, 0, hl]];
      return [
        ...faces.flatMap(([da, db, d0]) => [pl(steep * da, steep * db, steep * d0), pl(shallow * da, shallow * db, 0.75 * H + shallow * (d0 - 0.25 * hm))]),
        pl(0, 0, H),
      ];
    }
    case 'round': {
      // tangent planes of the ellipse (half width hw, height H) at these angles from the top: their envelope is the arc
      return [0, 20, -20, 40, -40, 58, -58, 72, -72].map((deg) => { const t = Math.sin(deg * RAD), c = Math.cos(deg * RAD); return pl(0, -(H * t) / (hw * c), H / c); });
    }
    default: return [];
  }
}

// --- cutting triangles along the creases -----------------------------------------------------------------------------------

type V = { p: Pt; f: number };
function clip(poly: V[], sign: 1 | -1): V[] {
  const out: V[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const [fa, fb] = [a.f * sign, b.f * sign];
    if (fa >= 0) out.push(a);
    if ((fa > 0 && fb < 0) || (fa < 0 && fb > 0)) {
      const t = fa / (fa - fb);
      out.push({ p: [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t], f: 0 });
    }
  }
  return out;
}

/** Appends the roof over one footprint triangle (counter-clockwise), cut wherever the lowest plane changes. */
function roofTriangle(tri: [Pt, Pt, Pt], planes: Plane[], eave: number, rise: number, out: number[], depth = 0): void {
  let cand = 0, best = Infinity;
  planes.forEach((pl, k) => { const v = at(pl, tri[0]); if (v < best) { best = v; cand = k; } });
  for (let guard = 0; guard <= planes.length; guard++) {
    let improved = false;
    for (let q = 0; q < planes.length; q++) {
      if (q === cand) continue;
      const f = tri.map((p) => at(planes[cand]!, p) - at(planes[q]!, p));
      const hi = Math.max(...f), lo = Math.min(...f);
      if (hi <= EPS) continue; // the candidate is not above q anywhere
      if (lo >= -EPS) { cand = q; improved = true; break; } // q is below the candidate everywhere
      if (depth < MAX_SPLIT_DEPTH) {
        const vs: V[] = tri.map((p, i) => ({ p, f: f[i]! }));
        for (const sign of [1, -1] as const) {
          const piece = clip(vs, sign);
          for (let i = 1; i + 1 < piece.length; i++) roofTriangle([piece[0]!.p, piece[i]!.p, piece[i + 1]!.p], planes, eave, rise, out, depth + 1);
        }
        return;
      }
    }
    if (!improved) break;
  }
  const pl = planes[cand]!;
  for (const p of tri) out.push(p[0], p[1], eave + Math.min(rise, Math.max(0, at(pl, p))));
}

/** Roof height along the edge p → q: breakpoints (t from 0 to 1, height above the eave) of the lower envelope of the planes. */
function edgeProfile(p: Pt, q: Pt, planes: Plane[], rise: number): { t: number; h: number }[] {
  if (!planes.length) return [{ t: 0, h: 0 }, { t: 1, h: 0 }];
  const v0 = planes.map((pl) => at(pl, p));
  const slope = planes.map((pl) => at(pl, q) - at(pl, p));
  let cur = 0;
  planes.forEach((_, k) => { if (v0[k]! < v0[cur]! - EPS || (Math.abs(v0[k]! - v0[cur]!) <= EPS && slope[k]! < slope[cur]!)) cur = k; });
  const clamp = (h: number) => Math.min(rise, Math.max(0, h));
  const pts = [{ t: 0, h: clamp(v0[cur]!) }];
  let t = 0;
  for (let guard = 0; guard <= planes.length; guard++) {
    let next = -1, dtBest = Infinity;
    for (let j = 0; j < planes.length; j++) {
      if (j === cur || slope[j]! >= slope[cur]! - EPS) continue;
      const dt = (v0[j]! + slope[j]! * t - (v0[cur]! + slope[cur]! * t)) / (slope[cur]! - slope[j]!);
      if (dt >= -EPS && dt < dtBest) { dtBest = dt; next = j; }
    }
    if (next < 0 || t + dtBest >= 1 - EPS) break;
    t = Math.max(t, t + dtBest);
    cur = next;
    pts.push({ t, h: clamp(v0[cur]! + slope[cur]! * t) });
  }
  pts.push({ t: 1, h: clamp(v0[cur]! + slope[cur]!) });
  return pts;
}

// --- radial roofs --------------------------------------------------------------------------------------------------------

/** [radius share, height share] from the outline inwards. */
function radialProfile(shape: RoofShape): [number, number][] {
  if (shape === 'dome') return [0, 15, 30, 45, 60, 75, 90].map((deg) => [Math.cos(deg * RAD), Math.sin(deg * RAD)] as [number, number]);
  if (shape === 'onion') return [[1, 0], [1.12, 0.12], [1.15, 0.28], [1, 0.48], [0.62, 0.72], [0.26, 0.9], [0, 1]];
  return [[1, 0], [0, 1]]; // cone and pyramid
}

function centroid(r: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const w = r[j]![0] * r[i]![1] - r[i]![0] * r[j]![1];
    a += w;
    cx += (r[j]![0] + r[i]![0]) * w;
    cy += (r[j]![1] + r[i]![1]) * w;
  }
  return Math.abs(a) < 1e-9 ? r[0]! : [cx / (3 * a), cy / (3 * a)];
}

function radialRoof(outer: Pt[], shape: RoofShape, eave: number, rise: number, out: number[]): void {
  const c = centroid(outer), prof = radialProfile(shape);
  const at3 = (p: Pt, k: number): number[] => [c[0] + (p[0] - c[0]) * prof[k]![0], c[1] + (p[1] - c[1]) * prof[k]![0], eave + rise * prof[k]![1]];
  for (let i = 0; i < outer.length; i++) {
    const p = outer[i]!, q = outer[(i + 1) % outer.length]!;
    for (let k = 0; k + 1 < prof.length; k++) {
      if (prof[k + 1]![0] === 0) out.push(...at3(p, k), ...at3(q, k), c[0], c[1], eave + rise * prof[k + 1]![1]);
      else out.push(...at3(p, k), ...at3(q, k), ...at3(q, k + 1), ...at3(p, k), ...at3(q, k + 1), ...at3(p, k + 1));
    }
  }
}

// --- the building ----------------------------------------------------------------------------------------------------------

/** The triangles of a polygon with holes (counter-clockwise, in the plane of the footprint). */
function triangulate(rings: Pt[][]): [Pt, Pt, Pt][] {
  const pts = rings.flat();
  const v = (r: Pt[]) => r.map((p) => new Vector2(p[0], p[1]));
  const faces = ShapeUtils.triangulateShape(v(rings[0]!), rings.slice(1).map(v));
  return faces.map(([a, b, c]) => {
    const t: [Pt, Pt, Pt] = [pts[a!]!, pts[b!]!, pts[c!]!];
    return area2(t) < 0 ? [t[0], t[2], t[1]] : t;
  });
}

/**
 * Walls and roof of one building or part. `rings`: outer ring first, then holes, in metres. Null when the outline is unusable.
 * A part that is only a roof (`building:part=roof`, `building=roof`) gets no walls: a canopy on the tags' height.
 */
export function buildBuilding(rings: Pt[][], tags: Tags): BuildingMesh | null {
  const clean = rings.map(cleanRing);
  if (!clean[0]) return null;
  // outer ring counter-clockwise, holes clockwise
  const loops = clean.filter((r): r is Pt[] => !!r).map((r, i) => ((area2(r) > 0) === (i === 0) ? r : r.slice().reverse()));
  const outer = loops[0]!;
  if (Math.abs(area2(outer)) / 2 < MIN_AREA_M2) return null;
  const d = dimensions(tags);
  const roofOnly = tags['building:part'] === 'roof' || tags.building === 'roof';
  const radial = d.shape === 'dome' || d.shape === 'onion' || d.shape === 'cone' || d.shape === 'pyramidal';
  const planes = radial ? [] : roofPlanes(d.shape, frameOf(outer, tags), d.rise);
  const walls: number[] = [];
  const roof: number[] = [];

  if (radial && d.rise > EPS) radialRoof(outer, d.shape, d.eave, d.rise, roof);
  else for (const t of triangulate(loops)) {
    if (planes.length) roofTriangle(t, planes, d.eave, d.rise, roof);
    else roof.push(t[0][0], t[0][1], d.eave, t[1][0], t[1][1], d.eave, t[2][0], t[2][1], d.eave);
  }

  // underside: floating parts and canopies
  if (roofOnly || d.base > MIN_WALL) {
    for (const t of triangulate(loops)) walls.push(t[0][0], t[0][1], d.base, t[2][0], t[2][1], d.base, t[1][0], t[1][1], d.base);
  }
  if (roofOnly) return { walls, roof };

  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i]!, q = loop[(i + 1) % loop.length]!;
      const prof = radial ? [{ t: 0, h: 0 }, { t: 1, h: 0 }] : edgeProfile(p, q, planes, d.rise);
      for (let k = 0; k + 1 < prof.length; k++) {
        const [a, b] = [prof[k]!, prof[k + 1]!];
        const pa: Pt = [p[0] + (q[0] - p[0]) * a.t, p[1] + (q[1] - p[1]) * a.t], pb: Pt = [p[0] + (q[0] - p[0]) * b.t, p[1] + (q[1] - p[1]) * b.t];
        const [za, zb] = [d.eave + a.h, d.eave + b.h];
        if (za <= d.base + EPS && zb <= d.base + EPS) continue;
        if (b.t - a.t < 1e-9) continue;
        // two triangles of the quad; one is dropped where the wall ends in a point (gable)
        if (zb > d.base + EPS) walls.push(pa[0], pa[1], d.base, pb[0], pb[1], d.base, pb[0], pb[1], zb);
        if (za > d.base + EPS) walls.push(pa[0], pa[1], d.base, pb[0], pb[1], zb, pa[0], pa[1], za);
      }
    }
  }
  return { walls, roof };
}
