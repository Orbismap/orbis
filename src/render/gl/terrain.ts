// Terrain correction of the ICON temperature and dew point: the model sees a smoothed surface (`hsurf`), the real
// terrain (`dem`) is finer. dT = 0.0065 K/m · (h_model − h_terrain), clamped to ±15 K, per pixel: warmer in valleys,
// colder on peaks. The result is ONE small float texture (lon/lat rectangle around the viewport, built when the map is
// zoomed in), the field shader adds it to T and (times 0.31) to Td. Pure parts are unit tested (terrain.test.ts).
//
// Heights: the bucket's own `v1/static/dem/*.owx` is not published (404), so the DEM comes from Mapterhorn
// (terrarium-encoded WebP tiles, CORS *), model surface heights from the run's `hsurf` OWX files.
import { loadField } from '../../data/owx';
import type { OwxField } from '../../data/owx';
import { sampleLevels, tilesForViewport, type GridLevel } from './grid';

export const TERRAIN_MIN_ZOOM = 5;
export const LAPSE_K_PER_M = 0.0065;
export const MAX_DELTA_K = 15;
export const DEM_URL = (z: number, x: number, y: number) => `https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`;
export const DEM_TILE = 512;
export const DEM_ATTRIBUTION = '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>';

/** [west, south, east, north] in degrees. */
export type Rect = [number, number, number, number];

/** Terrain correction in K on a lon/lat grid (row 0 = north), already faded out at the rectangle's edge. */
export interface TerrainGrid {
  rect: Rect;
  nx: number;
  ny: number;
  data: Float32Array;
  /** zoom it was built for */
  zoom: number;
}

/** Terrarium: height in m from the RGB bytes. */
export const terrariumHeight = (r: number, g: number, b: number): number => r * 256 + g + b / 256 - 32768;

export const lapseDelta = (hsurf: number, dem: number): number => Math.max(-MAX_DELTA_K, Math.min(MAX_DELTA_K, LAPSE_K_PER_M * (hsurf - dem)));

const lngToX = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z;
const latToY = (lat: number, z: number) => {
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

/** DEM tiles (x, y) covering a rectangle at zoom z. */
export function demTiles(rect: Rect, z: number): { x: number; y: number }[] {
  const n = 2 ** z;
  const x0 = Math.max(0, Math.floor(lngToX(rect[0], z)));
  const x1 = Math.min(n - 1, Math.floor(lngToX(rect[2], z) - 1e-9));
  const y0 = Math.max(0, Math.floor(latToY(rect[3], z)));
  const y1 = Math.min(n - 1, Math.floor(latToY(rect[1], z) - 1e-9));
  const out: { x: number; y: number }[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ x, y });
  return out;
}

/** Highest zoom (≤ maxZ) at which the rectangle needs at most `maxTiles` DEM tiles. */
export function pickDemZoom(rect: Rect, maxTiles = 30, maxZ = 10): number {
  for (let z = maxZ; z > 3; z--) if (demTiles(rect, z).length <= maxTiles) return z;
  return 3;
}

/** Heights of decoded DEM tiles with bilinear lookup in lon/lat (mosaic at one zoom). */
export class DemMosaic {
  private readonly tiles = new Map<string, Float32Array>();
  constructor(readonly z: number) {}
  set(x: number, y: number, heights: Float32Array): void {
    this.tiles.set(`${x}_${y}`, heights);
  }
  private px(x: number, y: number): number | undefined {
    const tx = Math.floor(x / DEM_TILE);
    const ty = Math.floor(y / DEM_TILE);
    const t = this.tiles.get(`${tx}_${ty}`);
    if (!t) return undefined;
    return t[(y - ty * DEM_TILE) * DEM_TILE + (x - tx * DEM_TILE)];
  }
  /** Height in m; undefined where no tile is loaded. Sea (negative) counts as 0. */
  sample(lng: number, lat: number): number | undefined {
    const fx = lngToX(lng, this.z) * DEM_TILE - 0.5;
    const fy = latToY(lat, this.z) * DEM_TILE - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const ax = fx - x0;
    const ay = fy - y0;
    const a = this.px(x0, y0);
    const b = this.px(x0 + 1, y0) ?? a;
    const c = this.px(x0, y0 + 1) ?? a;
    const d = this.px(x0 + 1, y0 + 1) ?? b ?? c;
    if (a === undefined) return undefined;
    const h = (a * (1 - ax) + b! * ax) * (1 - ay) + (c! * (1 - ax) + (d ?? c!) * ax) * ay;
    return Math.max(0, h);
  }
}

/** Weight 0 at the rectangle edge, 1 further than `feather` (degrees) inside. */
export function edgeFade(rect: Rect, lng: number, lat: number, feather: number): number {
  const d = Math.min(lng - rect[0], rect[2] - lng, lat - rect[1], rect[3] - lat);
  const t = Math.max(0, Math.min(1, d / feather));
  return t * t * (3 - 2 * t);
}

/** Grid size for a rectangle: one cell per DEM pixel, at most 1024 × 768. */
export function gridSize(rect: Rect, demZoom: number): { nx: number; ny: number } {
  const deg = 360 / (DEM_TILE * 2 ** demZoom);
  const midLat = (rect[1] + rect[3]) / 2;
  const nx = Math.max(16, Math.min(1024, Math.round((rect[2] - rect[0]) / deg)));
  const ny = Math.max(16, Math.min(768, Math.round((rect[3] - rect[1]) / (deg * Math.cos((midLat * Math.PI) / 180)))));
  return { nx, ny };
}

/**
 * Builds the correction grid from two height lookups. Cells without model or terrain height get 0. The fade at the
 * edge keeps the correction from ending in a step.
 */
export function buildDelta(
  rect: Rect,
  nx: number,
  ny: number,
  hsurf: (lng: number, lat: number) => number | undefined,
  dem: (lng: number, lat: number) => number | undefined,
): Float32Array {
  const out = new Float32Array(nx * ny);
  const feather = Math.min(rect[2] - rect[0], rect[3] - rect[1]) * 0.12;
  for (let j = 0; j < ny; j++) {
    const lat = rect[3] - ((j + 0.5) / ny) * (rect[3] - rect[1]);
    for (let i = 0; i < nx; i++) {
      const lng = rect[0] + ((i + 0.5) / nx) * (rect[2] - rect[0]);
      const hs = hsurf(lng, lat);
      const dm = dem(lng, lat);
      if (hs === undefined || dm === undefined) continue;
      out[j * nx + i] = lapseDelta(hs, dm) * edgeFade(rect, lng, lat, feather);
    }
  }
  return out;
}

/** Bilinear lookup in a TerrainGrid (K); 0 outside. Twin of the shader lookup. */
export function terrainDeltaAt(g: TerrainGrid | undefined, lng: number, lat: number): number {
  if (!g) return 0;
  const [w, s, e, n] = g.rect;
  if (lat < s || lat > n) return 0;
  const rel = (((lng - w) % 360) + 360) % 360;
  if (rel > e - w) return 0;
  const fx = (rel / (e - w)) * g.nx - 0.5;
  const fy = ((n - lat) / (n - s)) * g.ny - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const ax = fx - x0;
  const ay = fy - y0;
  const at = (x: number, y: number) => g.data[Math.max(0, Math.min(g.ny - 1, y)) * g.nx + Math.max(0, Math.min(g.nx - 1, x))]!;
  return (at(x0, y0) * (1 - ax) + at(x0 + 1, y0) * ax) * (1 - ay) + (at(x0, y0 + 1) * (1 - ax) + at(x0 + 1, y0 + 1) * ax) * ay;
}

// ---- loading ----------------------------------------------------------------------------------------

async function decodeDemTile(url: string, signal: AbortSignal): Promise<Float32Array> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`DEM ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
  const g = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  g.drawImage(bmp, 0, 0);
  const px = g.getImageData(0, 0, bmp.width, bmp.height).data;
  bmp.close();
  const out = new Float32Array(DEM_TILE * DEM_TILE);
  if (bmp.width !== DEM_TILE) throw new Error('DEM tile size');
  for (let i = 0; i < out.length; i++) out[i] = terrariumHeight(px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!);
  return out;
}

const hsurfCache = new Map<string, Promise<OwxField>>();
function hsurfField(run: string, part: 'o' | { c: number; r: number }): Promise<OwxField> {
  const key = `${run}|${part === 'o' ? 'o' : `${part.c}_${part.r}`}`;
  let p = hsurfCache.get(key);
  if (!p) {
    p = loadField(run, 'hsurf', part);
    p.catch(() => hsurfCache.delete(key));
    hsurfCache.set(key, p);
    while (hsurfCache.size > 12) hsurfCache.delete(hsurfCache.keys().next().value!);
  }
  return p;
}

/** Builds the correction for a rectangle: loads the model surface heights and the DEM tiles, then computes the grid. */
export async function loadTerrain(rect: Rect, run: string, signal: AbortSignal): Promise<TerrainGrid> {
  const zoom = pickDemZoom(rect);
  const tiles = demTiles(rect, zoom);
  const mosaic = new DemMosaic(zoom);
  const center = { lng: (rect[0] + rect[2]) / 2, lat: (rect[1] + rect[3]) / 2 };
  const hsIds = tilesForViewport(rect, center, 6);
  const [ov, hsTiles] = await Promise.all([
    hsurfField(run, 'o'),
    Promise.all(hsIds.map((id) => hsurfField(run, id).then((f) => ({ id, f }), () => undefined))),
    (async () => {
      let next = 0;
      const worker = async () => {
        while (next < tiles.length) {
          const t = tiles[next++]!;
          mosaic.set(t.x, t.y, await decodeDemTile(DEM_URL(zoom, t.x, t.y), signal));
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
    })(),
  ]);
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  const levels: GridLevel[] = [];
  for (const t of hsTiles) if (t) levels.push({ fields: [t.f], header: t.f.header });
  levels.push({ fields: [ov], header: ov.header });
  const br = { i0: 0, i1: 0, f: 0 };
  const { nx, ny } = gridSize(rect, zoom);
  const data = buildDelta(rect, nx, ny, (lng, lat) => sampleLevels(levels, 'value', br, lng, lat), (lng, lat) => mosaic.sample(lng, lat));
  return { rect, nx, ny, data, zoom };
}

/** Rectangle to build for a viewport (`bounds` = west, south, east, north): 25 % margin, at most 44° × 28°. */
export function terrainRect(bounds: readonly [number, number, number, number], center: { lng: number; lat: number }): Rect {
  const [w, s, e, n] = bounds;
  const hw = Math.min(22, ((e - w) / 2) * 1.25);
  const hh = Math.min(14, ((n - s) / 2) * 1.25);
  const lat0 = Math.max(-84, Math.min(84, center.lat));
  let lng0 = center.lng;
  lng0 = ((((lng0 + 180) % 360) + 360) % 360) - 180;
  const west = Math.max(-180, lng0 - hw);
  const east = Math.min(180, lng0 + hw);
  return [west, Math.max(-85, lat0 - hh), east, Math.min(85, lat0 + hh)];
}

/** True when `inner` lies inside `outer` (with the edge fade zone excluded). */
export function rectCovers(outer: Rect, inner: Rect, shrink = 0.06): boolean {
  const mx = (outer[2] - outer[0]) * shrink;
  const my = (outer[3] - outer[1]) * shrink;
  return inner[0] >= outer[0] + mx && inner[2] <= outer[2] - mx && inner[1] >= outer[1] + my && inner[3] <= outer[3] - my;
}
