// How much the ground rises and falls around a place: decides whether the 3D terrain is worth drawing. In a flat city
// (Berlin, the Netherlands, most of the US Midwest) the terrain costs every frame and shows nothing, so the Erkunden map
// leaves it off there. Reads coarse Mapterhorn tiles (zoom 10, about 76 m per pixel at the equator), the same elevation
// data as the terrain itself, decoded once per tile and kept.
import { MAPTERHORN } from './dem-protocol';

const Z = 10;
const SIZE = 512;
/** every STEP-th pixel is read: 128 x 128 heights per tile (64 KB) are plenty for a range over kilometres */
const STEP = 4;
const N = SIZE / STEP;
const MAX_TILES = 16;

const tiles = new Map<string, Promise<Float32Array | null>>();

const tileXY = (lng: number, lat: number) => {
  const n = 2 ** Z;
  const x = ((lng + 180) / 360) * n;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y };
};

function load(x: number, y: number): Promise<Float32Array | null> {
  const key = `${x}/${y}`;
  let p = tiles.get(key);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(`${MAPTERHORN}/${Z}/${x}/${y}.webp`);
        if (!r.ok) return null;
        const bmp = await createImageBitmap(await r.blob());
        const c = new OffscreenCanvas(SIZE, SIZE);
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bmp, 0, 0, SIZE, SIZE);
        bmp.close();
        const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
        const h = new Float32Array(N * N);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const o = ((j * STEP) * SIZE + i * STEP) * 4;
          h[j * N + i] = px[o]! * 256 + px[o + 1]! + px[o + 2]! / 256 - 32768;
        }
        return h;
      } catch { tiles.delete(key); return null; }
    })();
    tiles.set(key, p);
    if (tiles.size > MAX_TILES) tiles.delete(tiles.keys().next().value as string);
  }
  return p;
}

/**
 * Height range (metres, 2nd to 98th percentile, so a single chimney or pit does not count) of the ground in a box around the
 * given centre. `halfDeg` is the half width of the box in degrees. Resolves to undefined while the tiles are not available.
 */
export async function reliefRange(lng: number, lat: number, halfDeg: number): Promise<number | undefined> {
  const a = tileXY(lng - halfDeg, lat + halfDeg), b = tileXY(lng + halfDeg, lat - halfDeg);
  const x0 = Math.floor(a.x), x1 = Math.floor(b.x), y0 = Math.floor(a.y), y1 = Math.floor(b.y);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4) return undefined; // a box that large is not "a city"
  const heights: number[] = [];
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const t = await load(tx, ty);
    if (!t) return undefined;
    const i0 = Math.max(0, Math.floor((Math.max(a.x, tx) - tx) * N)), i1 = Math.min(N - 1, Math.floor((Math.min(b.x, tx + 1) - tx) * N));
    const j0 = Math.max(0, Math.floor((Math.max(a.y, ty) - ty) * N)), j1 = Math.min(N - 1, Math.floor((Math.min(b.y, ty + 1) - ty) * N));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) heights.push(t[j * N + i]!);
  }
  if (heights.length < 4) return undefined;
  heights.sort((p, q) => p - q);
  const at = (f: number) => heights[Math.min(heights.length - 1, Math.floor(f * heights.length))]!;
  return at(0.98) - at(0.02);
}
