// Dense global ocean grid (0.5°) built from sparse model samples.
//
// Open-Meteo Marine answers for single points. A 5° world lattice (about 1 600 ocean points) is the base; regional
// blocks on finer lattices (1°, 0.5°) are blended over it. Everything is pure and tested: the lattices are sampled
// bilinearly (exact at the samples, missing corners dropped from the weights, inverse-distance fill near coasts),
// the result is NOT clipped to the ocean here – the land mask clips when drawing, so colours reach the coast.

import type { MarineSample } from '../../data/parsers/oceangrid';

export const RES = 0.5;
export const NX = 720; // lon -180 … 179.5
export const NY = 361; // lat 90 … -90

/** Channels of one sample (all may be NaN). Directions are unit-vector components of the "from" bearing. */
export const CH = { cu: 0, cv: 1, wh: 2, wdx: 3, wdy: 4, wp: 5, sh: 6, sdx: 7, sdy: 8, sp: 9 } as const;
export const NCH = 10;

export type { MarineSample };

/** Regular lattice of samples: row 0 = lat0, column 0 = lon0, step in degrees. */
export interface Lattice {
  lat0: number;
  lon0: number;
  step: number;
  rows: number;
  cols: number;
  /** the lattice spans the full 360° and its columns wrap */
  wrap: boolean;
  v: Float32Array;
}

export function buildLattice(samples: readonly MarineSample[], b: { lat0: number; lat1: number; lon0: number; lon1: number }, step: number, wrap = false): Lattice {
  const rows = Math.round((b.lat1 - b.lat0) / step) + 1;
  const cols = wrap ? Math.round(360 / step) : Math.round((b.lon1 - b.lon0) / step) + 1;
  const v = new Float32Array(rows * cols * NCH).fill(NaN);
  for (const s of samples) {
    const j = Math.round((s.lat - b.lat0) / step);
    let i = Math.round((s.lon - b.lon0) / step);
    if (wrap) i = ((i % cols) + cols) % cols;
    if (j < 0 || j >= rows || i < 0 || i >= cols) continue;
    const o = (j * cols + i) * NCH;
    for (let c = 0; c < NCH; c++) v[o + c] = s.v[c] ?? NaN;
  }
  return { lat0: b.lat0, lon0: b.lon0, step, rows, cols, wrap, v };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Value of all channels at (lat, lon). Returns false when no sample is near (everything NaN).
 * Per channel: normalised bilinear over the four corners; where corners are missing (coast) it fades into an
 * inverse-distance mean over the surrounding 4×4 cells.
 */
export function sampleLattice(l: Lattice, lat: number, lon: number, out: Float32Array): boolean {
  const fy = (lat - l.lat0) / l.step;
  let fx = (lon - l.lon0) / l.step;
  if (l.wrap) fx = ((fx % l.cols) + l.cols) % l.cols;
  if (fy < -2 || fy > l.rows + 1 || (!l.wrap && (fx < -2 || fx > l.cols + 1))) {
    out.fill(NaN);
    return false;
  }
  const j0 = Math.floor(fy);
  const i0 = Math.floor(fx);
  const tx = fx - i0;
  const ty = fy - j0;
  const cell = (j: number, i: number): number => {
    if (j < 0 || j >= l.rows) return -1;
    if (l.wrap) i = ((i % l.cols) + l.cols) % l.cols;
    else if (i < 0 || i >= l.cols) return -1;
    return (j * l.cols + i) * NCH;
  };
  const o00 = cell(j0, i0);
  const o10 = cell(j0, i0 + 1);
  const o01 = cell(j0 + 1, i0);
  const o11 = cell(j0 + 1, i0 + 1);
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  let any = false;
  for (let c = 0; c < NCH; c++) {
    let sum = 0;
    let ws = 0;
    let a: number;
    if (o00 >= 0 && (a = l.v[o00 + c]!) === a) { sum += a * w00; ws += w00; }
    if (o10 >= 0 && (a = l.v[o10 + c]!) === a) { sum += a * w10; ws += w10; }
    if (o01 >= 0 && (a = l.v[o01 + c]!) === a) { sum += a * w01; ws += w01; }
    if (o11 >= 0 && (a = l.v[o11 + c]!) === a) { sum += a * w11; ws += w11; }
    let val = ws > 1e-6 ? sum / ws : NaN;
    if (ws < 0.6) {
      // coast: inverse-distance mean of the neighbourhood, blended in as the bilinear weight shrinks
      let s2 = 0;
      let w2 = 0;
      for (let j = j0 - 1; j <= j0 + 2; j++) {
        for (let i = i0 - 1; i <= i0 + 2; i++) {
          const o = cell(j, i);
          if (o < 0) continue;
          const x = l.v[o + c]!;
          if (x !== x) continue;
          const d2 = (j - fy) * (j - fy) + (i - fx) * (i - fx);
          if (d2 > 5) continue;
          const w = 1 / (d2 + 0.08);
          s2 += x * w;
          w2 += w;
        }
      }
      if (w2 > 0) {
        const idw = s2 / w2;
        val = val !== val ? idw : val * smooth(0.05, 0.6, ws) + idw * (1 - smooth(0.05, 0.6, ws));
      }
    }
    out[c] = val;
    if (val === val) any = true;
  }
  return any;
}

export class OceanGrid {
  readonly data: Float32Array[] = Array.from({ length: NCH }, () => new Float32Array(NX * NY).fill(NaN));
  /** bumps with every paint, so that consumers know to re-bake */
  version = 0;

  /**
   * Writes the lattice into the grid. `region` limits the cells (inclusive indices); with `feather` > 0 the result is
   * blended into the existing values over that many cells from the region edge (regional blocks over the base).
   */
  paint(l: Lattice, region?: { i0: number; i1: number; j0: number; j1: number }, feather = 0): void {
    const r = region ?? { i0: 0, i1: NX - 1, j0: 0, j1: NY - 1 };
    const tmp = new Float32Array(NCH);
    for (let j = Math.max(0, r.j0); j <= Math.min(NY - 1, r.j1); j++) {
      const lat = 90 - j * RES;
      for (let i = r.i0; i <= r.i1; i++) {
        const lon = -180 + i * RES;
        const gi = ((i % NX) + NX) % NX;
        const k = j * NX + gi;
        if (!sampleLattice(l, lat, lon, tmp)) continue;
        let w = 1;
        if (feather > 0) {
          const d = Math.min(i - r.i0, r.i1 - i, j - r.j0, r.j1 - j) + 1;
          w = smooth(0, feather, d);
        }
        for (let c = 0; c < NCH; c++) {
          const nv = tmp[c]!;
          if (nv !== nv) continue;
          const old = this.data[c]![k]!;
          this.data[c]![k] = w >= 1 || old !== old ? nv : old + (nv - old) * w;
        }
      }
    }
    this.version++;
  }

  clear(): void {
    for (const d of this.data) d.fill(NaN);
    this.version++;
  }
}

/** Region of grid indices that a lat/lon box covers. */
export function regionOf(b: { lat0: number; lat1: number; lon0: number; lon1: number }) {
  return {
    i0: Math.ceil((b.lon0 + 180) / RES),
    i1: Math.floor((b.lon1 + 180) / RES),
    j0: Math.ceil((90 - b.lat1) / RES),
    j1: Math.floor((90 - b.lat0) / RES),
  };
}

// ---- derived scalar and flow fields -------------------------------------------------------------

/** Bearing "from" as unit vector components (east, north). */
export const bearingVec = (deg: number): [number, number] => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)];
/** Back from averaged components to a bearing in degrees 0..360. */
export const vecBearing = (x: number, y: number): number => ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;

export type ScalarKind = 'current' | 'wave' | 'swell';

/** One value per grid cell (km/h for currents, m for waves); NaN where unknown. */
export function scalarField(g: OceanGrid, kind: ScalarKind): Float32Array {
  const out = new Float32Array(NX * NY);
  const d = g.data;
  for (let k = 0; k < out.length; k++) {
    out[k] = kind === 'current' ? Math.hypot(d[CH.cu]![k]!, d[CH.cv]![k]!) * 3.6 : d[kind === 'wave' ? CH.wh : CH.sh]![k]!;
  }
  return out;
}

/** NaN-aware bilinear lookup in a NX×NY scalar field. */
export function sampleScalar(f: Float32Array, lng: number, lat: number): number {
  let gx = (lng + 180) / RES;
  gx = ((gx % NX) + NX) % NX;
  const gy = Math.min(NY - 1.0001, Math.max(0, (90 - lat) / RES));
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const x1 = x0 + 1 >= NX ? 0 : x0 + 1;
  const a = f[y0 * NX + x0]!;
  const b = f[y0 * NX + x1]!;
  const c = f[(y0 + 1) * NX + x0]!;
  const e = f[(y0 + 1) * NX + x1]!;
  let sum = 0;
  let ws = 0;
  if (a === a) { sum += a * (1 - fx) * (1 - fy); ws += (1 - fx) * (1 - fy); }
  if (b === b) { sum += b * fx * (1 - fy); ws += fx * (1 - fy); }
  if (c === c) { sum += c * (1 - fx) * fy; ws += (1 - fx) * fy; }
  if (e === e) { sum += e * fx * fy; ws += fx * fy; }
  return ws > 0.2 ? sum / ws : NaN;
}

/** Interleaved vx, vy (east/north, "visual m/s") and colour scalar per cell, for the particle engine. */
export interface FlowField {
  vx: Float32Array;
  vy: Float32Array;
  /** 0..1 along the colour ramp */
  t: Float32Array;
}

export type FlowKind = 'current' | 'wave' | 'swell';

/**
 * Currents flow with (u, v) in m/s. Waves/swell travel opposite to the bearing they come from; since their phase speed
 * (10+ m/s) would be useless on screen, the visual speed only grows gently with the height.
 */
export function flowField(g: OceanGrid, kind: FlowKind, range: { max: number }): FlowField {
  const n = NX * NY;
  const vx = new Float32Array(n);
  const vy = new Float32Array(n);
  const t = new Float32Array(n);
  const d = g.data;
  for (let k = 0; k < n; k++) {
    if (kind === 'current') {
      const u = d[CH.cu]![k]!;
      const v = d[CH.cv]![k]!;
      if (u !== u || v !== v) { vx[k] = vy[k] = t[k] = NaN; continue; }
      vx[k] = u;
      vy[k] = v;
      t[k] = Math.min(1, (Math.hypot(u, v) * 3.6) / range.max);
    } else {
      const h = d[kind === 'wave' ? CH.wh : CH.sh]![k]!;
      const dx = d[kind === 'wave' ? CH.wdx : CH.sdx]![k]!;
      const dy = d[kind === 'wave' ? CH.wdy : CH.sdy]![k]!;
      const len = Math.hypot(dx, dy);
      if (h !== h || dx !== dx || dy !== dy || len < 1e-3) { vx[k] = vy[k] = t[k] = NaN; continue; }
      const speed = 0.2 + 0.18 * Math.min(h, 10);
      vx[k] = (-dx / len) * speed;
      vy[k] = (-dy / len) * speed;
      t[k] = Math.min(1, h / range.max);
    }
  }
  return { vx, vy, t };
}

/** Global lattice points worth requesting: ocean only (by mask), 5° by default. */
export function oceanPoints(
  isOceanAt: (lng: number, lat: number) => boolean,
  b: { lat0: number; lat1: number; lon0: number; lon1: number },
  step: number,
  /** a point also counts when another ocean cell lies within this many degrees (coasts, narrow seas) */
  near = 0,
): [lat: number, lon: number][] {
  const out: [number, number][] = [];
  const probe = (lat: number, lon: number) => {
    if (isOceanAt(lon, lat)) return true;
    if (near <= 0) return false;
    for (const [dy, dx] of [[near, 0], [-near, 0], [0, near], [0, -near], [near, near], [-near, -near], [near, -near], [-near, near]] as const) {
      if (isOceanAt(lon + dx, Math.max(-89.9, Math.min(89.9, lat + dy)))) return true;
    }
    return false;
  };
  const rows = Math.round((b.lat1 - b.lat0) / step);
  const cols = Math.round((b.lon1 - b.lon0) / step);
  for (let j = 0; j <= rows; j++) {
    const lat = +(b.lat0 + j * step).toFixed(4);
    for (let i = 0; i <= cols; i++) {
      const lon = +(b.lon0 + i * step).toFixed(4);
      const lw = lon >= 180 ? lon - 360 : lon;
      if (probe(lat, lw)) out.push([lat, lw]);
    }
  }
  return out;
}
