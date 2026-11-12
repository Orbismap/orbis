// Open-Meteo Air Quality (Copernicus CAMS): current values at the nodes of a coarse regular grid over Europe,
// requested with multi-location calls. Pure: location list, request URLs and the assembly of the answers.
export const AQ_VARS = [
  'european_aqi', 'pm2_5', 'pm10', 'nitrogen_dioxide', 'ozone',
  'birch_pollen', 'alder_pollen', 'grass_pollen', 'mugwort_pollen', 'olive_pollen', 'ragweed_pollen',
] as const;
export type AqVar = (typeof AQ_VARS)[number];

/** Grid nodes: west/south edge, step in degrees, counts. lat0 + j·step (south to north), lon0 + i·step. */
export interface AqGridSpec { lon0: number; lat0: number; step: number; nx: number; ny: number }
export const AQ_GRID: AqGridSpec = { lon0: -24, lat0: 33, step: 3, nx: 24, ny: 14 };

export interface AqGrid {
  lon0: number; lat0: number; step: number; nx: number; ny: number;
  /** model time of the values (ms) */
  time: number;
  /** row-major (j, i), NaN where the API returned null */
  vars: Record<AqVar, Float32Array>;
}

/** All nodes, row-major (j, i). */
export function aqLocations(g: AqGridSpec = AQ_GRID): { lat: number; lon: number }[] {
  const out: { lat: number; lon: number }[] = [];
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) out.push({ lat: +(g.lat0 + j * g.step).toFixed(3), lon: +(g.lon0 + i * g.step).toFixed(3) });
  return out;
}

/** Request URLs of at most `size` locations each (each location counts as one API call). */
export function aqUrls(size = 100, g: AqGridSpec = AQ_GRID): { url: string; locations: number }[] {
  const all = aqLocations(g);
  const out: { url: string; locations: number }[] = [];
  for (let k = 0; k < all.length; k += size) {
    const part = all.slice(k, k + size);
    const q = `latitude=${part.map((p) => p.lat).join(',')}&longitude=${part.map((p) => p.lon).join(',')}&current=${AQ_VARS.join(',')}&timezone=GMT`;
    out.push({ url: `https://air-quality-api.open-meteo.com/v1/air-quality?${q}`, locations: part.length });
  }
  return out;
}

interface OmCurrent { time?: string; [k: string]: unknown }
interface OmLocation { current?: OmCurrent }

/** Assembles the answers of all chunks (in request order) into a grid. Throws when the count does not match. */
export function airQualityGrid(chunks: unknown[], g: AqGridSpec = AQ_GRID): AqGrid {
  const locs = (chunks as unknown[]).flatMap((c) => (Array.isArray(c) ? (c as OmLocation[]) : [c as OmLocation]));
  const n = g.nx * g.ny;
  if (locs.length !== n) throw new Error(`Luftqualität: ${locs.length} statt ${n} Orte`);
  const vars = Object.fromEntries(AQ_VARS.map((v) => [v, new Float32Array(n).fill(NaN)])) as Record<AqVar, Float32Array>;
  let time = 0;
  locs.forEach((l, k) => {
    const c = l.current;
    if (!c) return;
    for (const v of AQ_VARS) {
      const x = c[v];
      if (typeof x === 'number' && Number.isFinite(x)) vars[v][k] = x;
    }
    const t = typeof c.time === 'string' ? Date.parse(`${c.time}:00Z`.replace(/:00:00Z$/, ':00Z')) : NaN;
    if (Number.isFinite(t) && t > time) time = t;
  });
  return { ...g, time, vars };
}

/** Bilinear value at a position; undefined outside the grid or where a corner is missing. */
export function aqSample(grid: AqGrid, v: AqVar, lng: number, lat: number): number | undefined {
  const fx = (lng - grid.lon0) / grid.step;
  const fy = (lat - grid.lat0) / grid.step;
  if (fx < 0 || fy < 0 || fx > grid.nx - 1 || fy > grid.ny - 1) return undefined;
  const i = Math.min(grid.nx - 2, Math.floor(fx));
  const j = Math.min(grid.ny - 2, Math.floor(fy));
  const ax = fx - i;
  const ay = fy - j;
  const a = grid.vars[v];
  const at = (x: number, y: number) => a[y * grid.nx + x]!;
  const q = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
  if (q.some((x) => Number.isNaN(x))) return undefined;
  return (q[0]! * (1 - ax) + q[1]! * ax) * (1 - ay) + (q[2]! * (1 - ax) + q[3]! * ax) * ay;
}
