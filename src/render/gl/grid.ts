// Pure helpers of the weather field renderer: time bracketing, grid sampling (the CPU twin of the fragment shader),
// tile selection for a viewport and derived quantities. No DOM, no GL: everything here is unit tested.
import type { OwxField, OwxHeader } from '../../data/owx/decode';

export type FieldMode = 'value' | 'magnitude' | 'humidity' | 'feels';

/** Dew point falls with height about 2 K/km, the temperature 6.5 K/km (terrain correction of the dew point). */
export const TD_LAPSE_RATIO = 0.002 / 0.0065;
/** Terrain correction applied to the stored variable(s): the temperature, or the dew point with its own factor. */
export type TerrainKind = 'T' | 'Td';

/**
 * Apparent temperature (Steadman / Australian BoM) in °C; t °C, rh %, ws m/s. Same formula as the old Orbis
 * (api/model.ts), including its Magnus constants for the humidity.
 */
export function apparentTemperature(t: number, rh: number, ws: number): number {
  const e = (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
  return t + 0.33 * e - 0.7 * ws - 4.0;
}

/** Humidity with the constants of the old app (17.62 / 243.12), used for the apparent temperature only. */
const rhOld = (t: number, d: number) => Math.max(0, Math.min(100, 100 * Math.exp((17.62 * d) / (243.12 + d) - (17.62 * t) / (243.12 + t))));

/** Two bracketing time steps and the weight of the second one. */
export interface Bracket { i0: number; i1: number; f: number }

/** Finds the steps around `t` in an ascending list of times. Outside the range it clamps (f = 0). */
export function bracketTime(times: readonly number[], t: number): Bracket {
  const n = times.length;
  if (n <= 1 || !(t > times[0]!)) return { i0: 0, i1: 0, f: 0 };
  if (t >= times[n - 1]!) return { i0: n - 1, i1: n - 1, f: 0 };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= t) lo = mid;
    else hi = mid;
  }
  return { i0: lo, i1: hi, f: (t - times[lo]!) / (times[hi]! - times[lo]!) };
}

/** Magnitude of a wind vector in m/s, in km/h. */
export const windKmh = (u: number, v: number): number => Math.hypot(u, v) * 3.6;

/** Relative humidity in % from temperature and dew point in °C (Magnus formula). */
export function relativeHumidity(t: number, td: number): number {
  const a = 17.625;
  const b = 243.04;
  const rh = 100 * Math.exp((a * td) / (b + td) - (a * t) / (b + t));
  return Math.min(100, Math.max(0, rh));
}

export function combine(mode: FieldMode, a: number, b: number): number {
  return mode === 'magnitude' ? windKmh(a, b) : mode === 'humidity' ? relativeHumidity(a, b) : a;
}

/** Number of variables a mode needs. */
export const modeVars = (mode: FieldMode): 1 | 2 | 4 => (mode === 'value' ? 1 : mode === 'feels' ? 4 : 2);

/**
 * Derived value from the stored variables `v` (value: [x]; magnitude: [u, v]; humidity: [T, Td]; feels: [T, Td, u, v])
 * with an optional terrain correction `dT` (K, temperature scale): the temperature gets dT, the dew point dT times its
 * own factor and never exceeds the temperature. CPU twin of `derive` in the shader.
 */
export function deriveField(mode: FieldMode, v: readonly number[], dT = 0, kind?: TerrainKind): number {
  if (mode === 'value') return v[0]! + (kind === 'T' ? dT : kind === 'Td' ? dT * TD_LAPSE_RATIO : 0);
  if (mode === 'magnitude') return windKmh(v[0]!, v[1]!);
  const t = v[0]! + dT;
  const td = Math.min(v[1]! + dT * TD_LAPSE_RATIO, t);
  if (mode === 'humidity') return relativeHumidity(t, td);
  return apparentTemperature(t, rhOld(t, td), Math.hypot(v[2]!, v[3]!));
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** One quantised sample of a time step at grid cell (x, y); undefined for nodata. */
function cell(f: OwxField, t: number, y: number, x: number): number | undefined {
  const h = f.header;
  const q = f.data[(t * h.ny + y) * h.nx + x]!;
  return q === h.nodata ? undefined : q;
}

/**
 * Bilinear sample at a position in space and time, in physical units. Longitude wraps on `wrap` grids;
 * positions outside a non-wrapping grid give undefined. Nodata corners are left out of the weights, and a corner
 * counts only when it is valid in both time steps.
 */
export function sampleGrid(f: OwxField, br: Bracket, lng: number, lat: number): number | undefined {
  const h = f.header;
  const dx = Math.abs(h.dx);
  const dy = Math.abs(h.dy);
  let gx = (lng - h.lon0) / dx;
  if (h.wrap) gx = mod(gx, h.nx);
  else {
    gx = mod(lng - h.lon0, 360) / dx; // tile origin: a longitude east of lon0 within the tile extent
    if (gx > h.nx - 1 + 1e-9) return undefined;
  }
  const gy = (h.lat0 - lat) / dy;
  if (gy < -1e-9 || gy > h.ny - 1 + 1e-9) return undefined;
  const x0 = Math.min(Math.floor(gx), h.wrap ? h.nx - 1 : h.nx - 2);
  const y0 = Math.min(Math.floor(gy), h.ny - 2);
  const fx = gx - x0;
  const fy = gy - y0;
  const x1 = h.wrap ? (x0 + 1) % h.nx : x0 + 1;
  const y1 = y0 + 1;
  let acc = 0;
  let wsum = 0;
  const corner = (x: number, y: number, w: number) => {
    const a = cell(f, br.i0, y, x);
    const b = br.f === 0 ? a : cell(f, br.i1, y, x);
    if (a === undefined || b === undefined) return;
    acc += w * (a + (b - a) * br.f);
    wsum += w;
  };
  corner(x0, y0, (1 - fx) * (1 - fy));
  corner(x1, y0, fx * (1 - fy));
  corner(x0, y1, (1 - fx) * fy);
  corner(x1, y1, fx * fy);
  if (wsum < 1e-6) return undefined;
  return (acc / wsum) * h.scale + h.offset;
}

// ---- tiles ------------------------------------------------------------------------------------

export interface TileId { c: number; r: number }
export const TILE_SIZE_DEG = 45;
export const TILE_COLS = 8;
export const TILE_ROWS = 4;
export const tileKey = (t: TileId) => `${t.c}_${t.r}`;

/** West and north edge of a tile. */
export const tileOrigin = (t: TileId): { lon0: number; lat0: number } => ({ lon0: -180 + t.c * TILE_SIZE_DEG, lat0: 90 - t.r * TILE_SIZE_DEG });

/** Tile containing a position. */
export function tileAt(lng: number, lat: number): TileId {
  return { c: Math.min(TILE_COLS - 1, Math.floor(mod(lng + 180, 360) / TILE_SIZE_DEG)), r: Math.min(TILE_ROWS - 1, Math.max(0, Math.floor((90 - lat) / TILE_SIZE_DEG))) };
}

const WEB_MERCATOR_MAX_LAT = 85.0511;

/**
 * Tiles that intersect a viewport (`bounds` = west, south, east, north; longitudes may exceed ±180), nearest to the
 * centre first, at most `max`. A viewport that spans the whole world returns the centre's tiles.
 */
export function tilesForViewport(bounds: readonly [number, number, number, number], center: { lng: number; lat: number }, max: number): TileId[] {
  const [w, s, e, n] = bounds;
  const north = Math.min(WEB_MERCATOR_MAX_LAT, Math.max(-WEB_MERCATOR_MAX_LAT, n));
  const south = Math.min(WEB_MERCATOR_MAX_LAT, Math.max(-WEB_MERCATOR_MAX_LAT, s));
  const rMin = Math.max(0, Math.min(TILE_ROWS - 1, Math.floor((90 - north) / TILE_SIZE_DEG)));
  const rMax = Math.max(0, Math.min(TILE_ROWS - 1, Math.ceil((90 - south) / TILE_SIZE_DEG) - 1));
  const width = e - w;
  const cols = new Set<number>();
  if (width >= 360) for (let c = 0; c < TILE_COLS; c++) cols.add(c);
  else {
    const first = Math.floor((w + 180) / TILE_SIZE_DEG);
    const last = Math.floor((e + 180 - 1e-9) / TILE_SIZE_DEG);
    for (let c = first; c <= last; c++) cols.add(mod(c, TILE_COLS));
  }
  const out: { t: TileId; d: number }[] = [];
  for (const c of cols) {
    for (let r = rMin; r <= rMax; r++) {
      const o = tileOrigin({ c, r });
      const cx = o.lon0 + TILE_SIZE_DEG / 2;
      const cy = o.lat0 - TILE_SIZE_DEG / 2;
      const dl = Math.abs(mod(center.lng - cx + 180, 360) - 180);
      out.push({ t: { c, r }, d: dl * dl + (center.lat - cy) ** 2 });
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, max).map((x) => x.t);
}

// ---- level of detail ----------------------------------------------------------------------------

/** One loaded grid (overview or tile) of one or two variables, all with the same grid. */
export interface GridLevel { fields: OwxField[]; header: OwxHeader }

/**
 * CPU twin of the shader: the value at a position in the display unit, preferring the first level that covers it
 * (callers pass tiles before the overview).
 */
export function sampleLevels(levels: readonly GridLevel[], mode: FieldMode, br: Bracket, lng: number, lat: number, terrain?: { dT: number; kind?: TerrainKind }): number | undefined {
  const n = modeVars(mode);
  outer: for (const lv of levels) {
    const vals: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = sampleGrid(lv.fields[i]!, br, lng, lat);
      if (x === undefined) continue outer;
      vals.push(x);
    }
    return deriveField(mode, vals, terrain?.dT ?? 0, terrain?.kind);
  }
  return undefined;
}

/** Slowly varying lat/lon of a mercator coordinate (0..1). */
export const mercToLng = (x: number) => x * 360 - 180;
export const mercToLat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
export const lngToMerc = (lng: number) => (lng + 180) / 360;
export const latToMerc = (lat: number) => {
  const r = (Math.max(-WEB_MERCATOR_MAX_LAT, Math.min(WEB_MERCATOR_MAX_LAT, lat)) * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};

/** Time of a model step as the shortest German-readable run note, e.g. "ICON-Lauf 10. Nov., 12 UTC". */
export function runNote(issued: number): string {
  const d = new Date(issued);
  const day = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d).replace(/\s+/g, ' ');
  return `ICON-Lauf ${day}, ${String(d.getUTCHours()).padStart(2, '0')} UTC`;
}
