// Radar values: RainViewer tile colours -> rain rate byte, the colour scale (LUT) and the motion estimate between two
// time steps. Pure functions (no GL, no DOM), shared by the radar kit and the worker parser (data/parsers/radar.ts).
// Ported from the old Orbis (globe/hdradar.ts, globe/radargl.ts).

/** first byte value that means "no measurement" (composites write 255) */
export const NODATA_MIN = 250;

// mm/h -> colour. Interpolated on a log scale, so light rain stays readable and heavy rain glows.
// Zoom Earth's legend: blue -> violet -> magenta -> salmon -> yellow.
export const STOPS: readonly [number, readonly [number, number, number, number]][] = [
  [0.002, [150, 205, 255, 0]],
  [0.01, [150, 205, 255, 175]], // even 0.01 mm/h is a clearly blue veil, bright enough over dark imagery
  [0.05, [140, 198, 255, 195]],
  [0.2, [120, 180, 252, 210]],
  [0.6, [100, 158, 246, 222]],
  [1.5, [85, 120, 238, 230]],
  [3, [125, 90, 225, 236]],
  [6, [190, 75, 180, 242]],
  [10, [228, 85, 135, 246]],
  [20, [244, 130, 100, 249]],
  [40, [250, 190, 85, 252]],
  [80, [255, 240, 95, 255]],
];

/** rain rate [mm/h] of a byte (sqrt coded: byte = 25 * sqrt(mm/h)) */
export const rainRate = (byte: number): number => (byte / 25) ** 2;

/** byte of a rain rate (0 below 0.002 mm/h) */
export const rateByte = (mmh: number): number => (mmh < 0.002 ? 0 : Math.min(NODATA_MIN - 1, Math.round(Math.sqrt(mmh) * 25)));

/** RGBA colour of a rain rate on the scale (not premultiplied; alpha 0..255) */
export function rateColor(mmh: number): [number, number, number, number] {
  let k = 0;
  while (k < STOPS.length - 2 && mmh > STOPS[k + 1]![0]) k++;
  const [m0, c0] = STOPS[k]!;
  const [m1, c1] = STOPS[k + 1]!;
  const t = Math.max(0, Math.min(1, Math.log(mmh / m0) / Math.log(m1 / m0)));
  return [0, 1, 2, 3].map((c) => c0[c]! + (c1[c]! - c0[c]!) * t) as [number, number, number, number];
}

/** byte value -> RGBA, 256 entries (0 and >= NODATA_MIN stay transparent). The shader premultiplies. */
export function buildRadarLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let v = 1; v < NODATA_MIN; v++) lut.set(rateColor(rainRate(v)), v * 4);
  return lut;
}

export function rainLabel(mmh: number): string {
  if (mmh < 0.5) return 'Sehr leichter Regen';
  if (mmh < 2.5) return 'Leichter Regen';
  if (mmh < 10) return 'Mäßiger Regen';
  if (mmh < 50) return 'Starker Regen';
  return 'Sehr starker Regen';
}

// ---- RainViewer tile colours -> rain rate -----------------------------------------------------
/** weakest RainViewer haze that is still drawn (alpha < 100 is not shown by zoom.earth either) */
const TAN_MIN_ALPHA = 100;

const WARM: [number, number, number, number][] = [
  [255, 238, 0, 36],
  [255, 170, 0, 42],
  [255, 68, 0, 48],
  [193, 0, 0, 55],
  [255, 170, 255, 62],
];

/** RGBA of a RainViewer tile pixel (colour scheme 2) -> rain rate [mm/h] (rough dBZ anchors, Marshall-Palmer) */
export function rainviewerRate(r: number, g: number, b: number, a: number): number {
  if (a === 0) return 0;
  let dbz: number;
  if (a < 255 && b <= g) {
    if (a < TAN_MIN_ALPHA) return 0;
    dbz = 2 + ((a - 20) / 170) * 13; // tan: 2 ... 15 dBZ
  } else if (r > 150 && !(b > r && g < 200)) {
    let best = WARM[0]!;
    let bd = Infinity;
    for (const w of WARM) {
      const d = (w[0] - r) ** 2 + (w[1] - g) ** 2 + (w[2] - b) ** 2;
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    dbz = best[3];
  } else {
    // blues: R falls 136 -> 0, then G falls 163 -> 85
    const p = r > 0 ? ((136 - r) / 136) * 0.25 : 0.25 + ((163 - g) / (163 - 85)) * 0.75;
    dbz = 15 + Math.max(0, Math.min(1, p)) * 20;
  }
  return (10 ** (dbz / 10) / 200) ** 0.625;
}

/** RGBA pixels of a RainViewer tile (size x size) -> value bytes */
export function pixelsToBytes(data: ArrayLike<number>, size: number): Uint8Array {
  const bytes = new Uint8Array(size * size);
  for (let i = 0; i < bytes.length; i++) bytes[i] = rateByte(rainviewerRate(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!, data[i * 4 + 3]!));
  return bytes;
}

// ---- motion between two steps -----------------------------------------------------------------
export const FLOW_N = 128; // values are compared at 128 x 128 per tile
export const FLOW_G = 16; // one vector per 8 x 8 values
export const FLOW_R = 8; // search radius in those values (about 19 km at zoom 7 for 1.2 km texels)

function downsample(bytes: Uint8Array, size: number): Float32Array {
  const out = new Float32Array(FLOW_N * FLOW_N);
  const f = size / FLOW_N;
  for (let y = 0; y < FLOW_N; y++) {
    for (let x = 0; x < FLOW_N; x++) {
      let sum = 0;
      for (let j = 0; j < f; j++) {
        for (let i = 0; i < f; i++) {
          const v = bytes[(y * f + j) * size + x * f + i]!;
          sum += v >= NODATA_MIN ? 0 : v;
        }
      }
      out[y * FLOW_N + x] = sum / (f * f);
    }
  }
  return out;
}

/**
 * Where does the rain of `a` appear in `b`? Block matching on a coarse grid: for every 16 x 16 window the shift with
 * the smallest squared difference. Vectors without a clear match take the tile's dominant motion (weather moves
 * coherently), then the field is smoothed. Result: for each of FLOW_G x FLOW_G cells a (dx, dy) in texture units
 * (0..1 of the tile): the content of `a` at p is at p + d in `b`. Sizes must be multiples of FLOW_N.
 */
export function computeFlow(a: Uint8Array, sa: number, b: Uint8Array, sb: number): Float32Array {
  const A = downsample(a, sa);
  const B = downsample(b, sb);
  const N = FLOW_N;
  const cell = N / FLOW_G;
  const half = cell; // window = 2 cells wide (overlapping), centred on the cell
  const vx = new Float32Array(FLOW_G * FLOW_G);
  const vy = new Float32Array(FLOW_G * FLOW_G);
  const wgt = new Float32Array(FLOW_G * FLOW_G); // confidence x energy
  let sumX = 0;
  let sumY = 0;
  let sumW = 0;
  for (let gy = 0; gy < FLOW_G; gy++) {
    for (let gx = 0; gx < FLOW_G; gx++) {
      const x0 = gx * cell + cell / 2 - half;
      const y0 = gy * cell + cell / 2 - half;
      let energy = 0;
      for (let j = 0; j < 2 * half; j++) {
        for (let i = 0; i < 2 * half; i++) {
          const x = x0 + i;
          const y = y0 + j;
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          energy += A[y * N + x]! + B[y * N + x]!;
        }
      }
      if (energy < 2 * half * 2 * half * 1.5) continue; // nearly empty window
      let best = Infinity;
      let bsx = 0;
      let bsy = 0;
      let zero = 0;
      for (let sy = -FLOW_R; sy <= FLOW_R; sy++) {
        for (let sx = -FLOW_R; sx <= FLOW_R; sx++) {
          let ssd = 0;
          for (let j = 0; j < 2 * half; j += 2) {
            const y = y0 + j;
            if (y < 0 || y >= N) continue;
            const yy = y + sy;
            for (let i = 0; i < 2 * half; i += 2) {
              const x = x0 + i;
              if (x < 0 || x >= N) continue;
              const xx = x + sx;
              const bv = xx < 0 || yy < 0 || xx >= N || yy >= N ? 0 : B[yy * N + xx]!;
              const d = A[y * N + x]! - bv;
              ssd += d * d;
            }
          }
          if (sx === 0 && sy === 0) zero = ssd;
          ssd += (sx * sx + sy * sy) * 0.4 * (energy / (4 * half * half)); // prefer small moves
          if (ssd < best) {
            best = ssd;
            bsx = sx;
            bsy = sy;
          }
        }
      }
      const gain = zero > 0 ? (zero - best) / zero : 0;
      if (gain < 0.15) continue; // no clearer than standing still
      const k = gy * FLOW_G + gx;
      vx[k] = bsx;
      vy[k] = bsy;
      wgt[k] = gain * energy;
      sumX += bsx * wgt[k]!;
      sumY += bsy * wgt[k]!;
      sumW += wgt[k]!;
    }
  }
  // fall back to the dominant motion where nothing was found
  const mx = sumW > 0 ? sumX / sumW : 0;
  const my = sumW > 0 ? sumY / sumW : 0;
  for (let k = 0; k < vx.length; k++) {
    if (wgt[k] === 0) {
      vx[k] = mx;
      vy[k] = my;
    }
  }
  // 3 x 3 smoothing
  const out = new Float32Array(FLOW_G * FLOW_G * 2);
  for (let gy = 0; gy < FLOW_G; gy++) {
    for (let gx = 0; gx < FLOW_G; gx++) {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const x = gx + i;
          const y = gy + j;
          if (x < 0 || y < 0 || x >= FLOW_G || y >= FLOW_G) continue;
          sx += vx[y * FLOW_G + x]!;
          sy += vy[y * FLOW_G + x]!;
          n++;
        }
      }
      const k = (gy * FLOW_G + gx) * 2;
      out[k] = sx / n / N;
      out[k + 1] = sy / n / N;
    }
  }
  return out;
}
