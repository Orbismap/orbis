// Planar geometry for street-scale road drawing. All coordinates are local METRES (x east, y north) unless stated.
export type XY = [number, number];

const M_LAT = 111320;
const RAD = Math.PI / 180;
/** lng/lat <-> local metres around an origin. */
export const localFrame = (lon0: number, lat0: number) => {
  const kx = Math.cos(lat0 * RAD) * M_LAT;
  return {
    to: (p: readonly number[]): XY => [(p[0]! - lon0) * kx, (p[1]! - lat0) * M_LAT],
    from: (p: XY): XY => [lon0 + p[0] / kx, lat0 + p[1] / M_LAT],
  };
};

const len = (a: XY, b: XY) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lerp = (a: XY, b: XY, t: number): XY => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * Rounds the corners of a polyline: every inner vertex is replaced by two points on its adjacent segments, at most `limit`
 * metres (and a third of the segment) away; repeated with the next limit. End points and `pinned` vertices (junctions) stay
 * exactly where they are, so lines keep joining.
 */
export function smooth(pts: XY[], limits: number[] = [14, 7], pinned?: boolean[]): XY[] {
  let cur = pts;
  let pin = pinned ?? pts.map(() => false);
  for (const limit of limits) {
    if (cur.length < 3) break;
    const out: XY[] = [cur[0]!];
    const outPin: boolean[] = [true];
    for (let i = 1; i < cur.length - 1; i++) {
      const a = cur[i - 1]!, b = cur[i]!, c = cur[i + 1]!;
      const l1 = len(a, b), l2 = len(b, c);
      if (pin[i] || l1 < 1e-6 || l2 < 1e-6) { out.push(b); outPin.push(pin[i] ?? false); continue; }
      out.push(lerp(b, a, Math.min(l1 / 3, limit) / l1), lerp(b, c, Math.min(l2 / 3, limit) / l2));
      outPin.push(false, false);
    }
    out.push(cur[cur.length - 1]!);
    outPin.push(true);
    cur = out;
    pin = outPin;
  }
  return cur;
}

/**
 * Makes junctions exact before smoothing: the end of a line that stops at (or just short of) another line is moved onto it,
 * and the joining place becomes a vertex of that line (inserted when needed). Returns the lines (with the inserted
 * vertices) and, per vertex, whether it is a junction that smoothing must not move.
 */
export function snapNetwork(input: XY[][], reach = 2.5): { lines: XY[][]; pinned: boolean[][] } {
  const lines = input.map((l) => [...l]);
  const pinned = lines.map((l) => l.map((_, i) => i === 0 || i === l.length - 1));
  const CELL = 12, OFF = 1 << 14, W = 1 << 15;
  const segLine: number[] = [], segPos: number[] = [];
  const cells = new Map<number, number[]>();
  lines.forEach((l, li) => {
    for (let si = 0; si < l.length - 1; si++) {
      const a = l[si]!, b = l[si + 1]!, id = segLine.length;
      segLine.push(li); segPos.push(si);
      for (let cx = Math.floor(Math.min(a[0], b[0]) / CELL); cx <= Math.floor(Math.max(a[0], b[0]) / CELL); cx++) {
        for (let cy = Math.floor(Math.min(a[1], b[1]) / CELL); cy <= Math.floor(Math.max(a[1], b[1]) / CELL); cy++) {
          const k = (cx + OFF) * W + (cy + OFF);
          const list = cells.get(k);
          if (list) list.push(id); else cells.set(k, [id]);
        }
      }
    }
  });
  const inserts = new Map<number, { j: number; t: number; p: XY }[]>();
  lines.forEach((A, ai) => {
    for (const end of [0, A.length - 1]) {
      const e = A[end]!;
      let best = reach, bi = -1, bj = -1, bt = 0, bp: XY | undefined;
      const tried = new Set<number>();
      const cx0 = Math.floor(e[0] / CELL), cy0 = Math.floor(e[1] / CELL);
      for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) {
        for (const id of cells.get((cx + OFF) * W + (cy + OFF)) ?? []) {
          const li = segLine[id]!;
          if (li === ai || tried.has(id)) continue;
          tried.add(id);
          const j = segPos[id]!, a = lines[li]![j]!, b = lines[li]![j + 1]!;
          const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
          if (l2 < 1e-9) continue;
          const t = Math.max(0, Math.min(1, ((e[0] - a[0]) * (b[0] - a[0]) + (e[1] - a[1]) * (b[1] - a[1])) / l2));
          const p = lerp(a, b, t), d = len(e, p);
          if (d < best) { best = d; bi = li; bj = j; bt = t; bp = p; }
        }
      }
      if (!bp) continue;
      const B = lines[bi]!;
      const da = len(bp, B[bj]!), db = len(bp, B[bj + 1]!);
      if (Math.min(da, db) < 1.5) { // next to an existing vertex: use that one
        const v = da <= db ? bj : bj + 1;
        A[end] = B[v]!;
        pinned[bi]![v] = true;
      } else {
        A[end] = bp;
        let list = inserts.get(bi);
        if (!list) inserts.set(bi, (list = []));
        list.push({ j: bj, t: bt, p: bp });
      }
    }
  });
  for (const [li, list] of inserts) {
    list.sort((x, y) => x.j - y.j || x.t - y.t);
    const pts: XY[] = [], pin: boolean[] = [];
    let k = 0;
    lines[li]!.forEach((v, i) => {
      pts.push(v); pin.push(pinned[li]![i]!);
      while (k < list.length && list[k]!.j === i) { pts.push(list[k]!.p); pin.push(true); k++; }
    });
    lines[li] = pts;
    pinned[li] = pin;
  }
  return { lines, pinned };
}

export const lineLength = (pts: XY[]) => { let s = 0; for (let i = 1; i < pts.length; i++) s += len(pts[i - 1]!, pts[i]!); return s; };

/** The parts of a polyline outside the given [from, to] arc-length zones (metres); parts shorter than `minLen` are dropped. */
export function cutLine(pts: XY[], zones: [number, number][], minLen = 1.5): XY[][] {
  if (!zones.length) return [pts];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + len(pts[i - 1]!, pts[i]!));
  const total = cum[cum.length - 1]!;
  const sorted = zones.map(([a, b]) => [Math.max(0, a), Math.min(total, b)] as [number, number]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const keep: [number, number][] = [];
  let at = 0;
  for (const [a, b] of sorted) { if (a > at) keep.push([at, a]); at = Math.max(at, b); }
  if (at < total) keep.push([at, total]);
  const pointAt = (s: number): XY => {
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < s) i++;
    const seg = cum[i]! - cum[i - 1]!;
    return seg > 0 ? lerp(pts[i - 1]!, pts[i]!, (s - cum[i - 1]!) / seg) : pts[i]!;
  };
  const parts: XY[][] = [];
  for (const [a, b] of keep) {
    if (b - a < minLen) continue;
    const part: XY[] = [pointAt(a)];
    for (let i = 0; i < pts.length; i++) if (cum[i]! > a && cum[i]! < b) part.push(pts[i]!);
    part.push(pointAt(b));
    parts.push(part);
  }
  return parts;
}

export interface NetLine { pts: XY[]; /** half width in metres */ hw: number; /** 0 ground, 1 bridge: only equal levels meet */ level: number }

/**
 * Where lines meet or cross (same level): for every line the arc-length zones around those places in which its own markings
 * must stop, so that edge and centre lines do not run through the surface of the other road. A near-parallel meeting (a
 * continuation, a shallow merge) is no junction.
 */
export function junctionZones(lines: NetLine[]): Map<number, [number, number][]> {
  const zones = new Map<number, [number, number][]>();
  const add = (li: number, s: number, r: number) => { let z = zones.get(li); if (!z) zones.set(li, (z = [])); z.push([s - r, s + r]); };
  const CELL = 30, OFF = 1 << 14, W = 1 << 15;
  // segments get a global id; the grid maps a cell to the ids of the segments touching it (numeric keys: this is the hot loop)
  const segLine: number[] = [], segPos: number[] = [];
  const cells = new Map<number, number[]>();
  const cum: number[][] = [];
  lines.forEach((l, li) => {
    const c = [0];
    for (let i = 1; i < l.pts.length; i++) c.push(c[i - 1]! + len(l.pts[i - 1]!, l.pts[i]!));
    cum.push(c);
    for (let si = 0; si < l.pts.length - 1; si++) {
      const a = l.pts[si]!, b = l.pts[si + 1]!;
      const id = segLine.length;
      segLine.push(li); segPos.push(si);
      const x0 = Math.floor(Math.min(a[0], b[0]) / CELL), x1 = Math.floor(Math.max(a[0], b[0]) / CELL);
      const y0 = Math.floor(Math.min(a[1], b[1]) / CELL), y1 = Math.floor(Math.max(a[1], b[1]) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const k = (cx + OFF) * W + (cy + OFF);
        const list = cells.get(k);
        if (list) list.push(id); else cells.set(k, [id]);
      }
    }
  });
  const total = segLine.length;
  const seen = new Set<number>();
  const reach = (hwOther: number, hwSelf: number, sin: number, cos: number) => Math.min(25, (hwOther + hwSelf * Math.abs(cos)) / Math.max(sin, 0.3) + 0.6);
  for (let g = 0; g < total; g++) {
    const ai = segLine[g]!;
    const si = segPos[g]!;
    const A = lines[ai]!;
    const a0 = A.pts[si]!, a1 = A.pts[si + 1]!;
    const la = len(a0, a1);
    if (la < 1e-6) continue;
    const dax = (a1[0] - a0[0]) / la, day = (a1[1] - a0[1]) / la;
    const x0 = Math.floor(Math.min(a0[0], a1[0]) / CELL), x1 = Math.floor(Math.max(a0[0], a1[0]) / CELL);
    const y0 = Math.floor(Math.min(a0[1], a1[1]) / CELL), y1 = Math.floor(Math.max(a0[1], a1[1]) / CELL);
    const tried = new Set<number>();
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      for (const h of cells.get((cx + OFF) * W + (cy + OFF)) ?? []) {
        const bi = segLine[h]!;
        if (bi === ai || tried.has(h)) continue;
        tried.add(h);
        const B = lines[bi]!;
        if (B.level !== A.level) continue;
        const sj = segPos[h]!;
        const b0 = B.pts[sj]!, b1 = B.pts[sj + 1]!;
        const lb = len(b0, b1);
        if (lb < 1e-6) continue;
        const dbx = (b1[0] - b0[0]) / lb, dby = (b1[1] - b0[1]) / lb;
        const cross = dax * dby - day * dbx;
        const sin = Math.abs(cross), cos = dax * dbx + day * dby;
        if (sin < 0.3) continue;
        // proper intersection (handled once per pair of segments)
        const ex = b0[0] - a0[0], ey = b0[1] - a0[1];
        const t = (ex * dby - ey * dbx) / cross; // metres along A
        const u = (ex * day - ey * dax) / cross; // metres along B
        const pair = g < h ? g * total + h : h * total + g;
        if (t >= 0 && t <= la && u >= 0 && u <= lb && !seen.has(pair)) {
          seen.add(pair);
          add(ai, cum[ai]![si]! + t, reach(B.hw, A.hw, sin, cos));
          add(bi, cum[bi]![sj]! + u, reach(A.hw, B.hw, sin, cos));
          continue;
        }
        // an end of A that stops at (or just short of) B: T junction
        for (const endT of [0, la]) {
          if ((endT === 0 && si !== 0) || (endT === la && si !== A.pts.length - 2)) continue;
          const px = a0[0] + dax * endT, py = a0[1] + day * endT;
          const uu = Math.max(0, Math.min(lb, (px - b0[0]) * dbx + (py - b0[1]) * dby));
          if (Math.hypot(b0[0] + dbx * uu - px, b0[1] + dby * uu - py) <= 2) {
            add(ai, cum[ai]![si]! + endT, reach(B.hw, A.hw, sin, cos));
            add(bi, cum[bi]![sj]! + uu, reach(A.hw, B.hw, sin, cos));
          }
        }
      }
    }
  }
  return zones;
}

/** The first `m` metres of a polyline (fewer if it is shorter). */
export function takeFromStart(pts: XY[], m: number): XY[] {
  const out: XY[] = [pts[0]!];
  let left = m;
  for (let i = 1; i < pts.length && left > 0; i++) {
    const l = len(pts[i - 1]!, pts[i]!);
    if (l >= left) { out.push(lerp(pts[i - 1]!, pts[i]!, left / l)); return out; }
    out.push(pts[i]!);
    left -= l;
  }
  return out;
}

/**
 * Kerb strips along both sides of a road: from the surface edge (`hw`) outwards by `full` metres between the arc
 * positions `from` and `to` (the bridge), easing to `base` metres over `taper` metres outside of it (on the connecting
 * road). Returns small quads that share their edges (and overlap a hair so no seam shows) plus for each the blend `t`
 * (0 = bridge, 1 = normal road) for the colour. The strips never cover the road surface itself.
 */
export function kerbStrips(center: XY[], hw: number, from: number, to: number, full: number, base: number, taper: number, steps = 16): { ring: XY[]; t: number }[] {
  const cum = [0];
  for (let i = 1; i < center.length; i++) cum.push(cum[i - 1]! + len(center[i - 1]!, center[i]!));
  const total = cum[cum.length - 1]!;
  const pointAt = (s: number): XY => {
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < s) i++;
    const seg = cum[i]! - cum[i - 1]!;
    return seg > 0 ? lerp(center[i - 1]!, center[i]!, Math.max(0, Math.min(1, (s - cum[i - 1]!) / seg))) : center[i]!;
  };
  const blend = (s: number) => {
    const d = s < from ? from - s : s > to ? s - to : 0;
    const f = taper > 0 ? Math.max(0, Math.min(1, d / taper)) : 1;
    return f * f * (3 - 2 * f);
  };
  const at = new Set<number>(cum);
  for (let k = 0; k <= steps; k++) { at.add(Math.max(0, from - (k * taper) / steps)); at.add(Math.min(total, to + (k * taper) / steps)); }
  at.add(from); at.add(to);
  const S = [...at].filter((s) => s >= 0 && s <= total).sort((a, b) => a - b);
  const frame = (s: number) => {
    const a = pointAt(Math.max(0, s - 0.6)), b = pointAt(Math.min(total, s + 0.6)), p = pointAt(s);
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    return { p, n: [-dy / d, dx / d] as XY, e: full + (base - full) * blend(s) };
  };
  const out: { ring: XY[]; t: number }[] = [];
  for (let k = 0; k < S.length - 1; k++) {
    const sa = S[k]!, sb = S[k + 1]!;
    if (sb - sa < 0.05) continue;
    const a = frame(sa), b = frame(Math.min(total, sb + 0.12));
    const t = blend((sa + sb) / 2);
    for (const side of [-1, 1]) {
      const pt = (f: ReturnType<typeof frame>, o: number): XY => [f.p[0] + side * f.n[0] * o, f.p[1] + side * f.n[1] * o];
      out.push({ ring: [pt(a, hw), pt(a, hw + a.e), pt(b, hw + b.e), pt(b, hw), pt(a, hw)], t });
    }
  }
  return out;
}
