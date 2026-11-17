import { GEOID_COLS, GEOID_DM_B64, GEOID_ROWS, GEOID_STEP } from './geoid.generated';

// Geoid height N (EGM96, metres above the WGS84 ellipsoid) anywhere, from a 2-degree grid, bilinear (good to a few metres).
// 3D tiles carry ellipsoid heights, the map sea level: a tileset is lowered by N (offset -N is what `place` gets).

let grid: Int16Array | undefined;
function load(): Int16Array {
  if (grid) return grid;
  const bin = atob(GEOID_DM_B64);
  const view = new DataView(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) view.setUint8(i, bin.charCodeAt(i));
  grid = new Int16Array(GEOID_ROWS * GEOID_COLS);
  for (let i = 0; i < grid.length; i++) grid[i] = view.getInt16(2 * i, true);
  return grid;
}

/** Geoid height in metres at a place (degrees). */
export function geoidHeight(lng: number, lat: number): number {
  const g = load();
  const fr = (90 - Math.max(-90, Math.min(90, lat))) / GEOID_STEP;
  const fc = (((lng % 360) + 360) % 360) / GEOID_STEP;
  const r0 = Math.min(GEOID_ROWS - 2, Math.floor(fr));
  const c0 = Math.floor(fc) % GEOID_COLS;
  const c1 = (c0 + 1) % GEOID_COLS;
  const tr = fr - r0, tc = fc - Math.floor(fc);
  const at = (r: number, c: number) => g[r * GEOID_COLS + c]! / 10;
  return (at(r0, c0) * (1 - tc) + at(r0, c1) * tc) * (1 - tr) + (at(r0 + 1, c0) * (1 - tc) + at(r0 + 1, c1) * tc) * tr;
}
