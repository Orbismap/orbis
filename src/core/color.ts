// Colour parsing, scales and lookup tables. Interpolation happens in OKLab so ramps look even.
export type RGBA = [r: number, g: number, b: number, a: number]; // r,g,b 0..255, a 0..255

export interface ColorScale {
  stops: [value: number, cssColor: string][];
  /** Unit in the app's base units (see core/units.ts) – only a label, no conversion happens here. */
  unit?: string;
  /** Suggested legend ticks. */
  ticks?: number[];
}

export function parseColor(css: string): RGBA {
  const s = css.trim().toLowerCase();
  if (s === 'transparent') return [0, 0, 0, 0];
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length === 6) h += 'ff';
    if (h.length !== 8) throw new Error(`bad colour: ${css}`);
    const n = parseInt(h, 16);
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length >= 3 && p.every((v) => !Number.isNaN(v))) return [p[0]!, p[1]!, p[2]!, Math.round((p[3] ?? 1) * 255)];
  }
  throw new Error(`bad colour: ${css}`);
}

export const toCss = ([r, g, b, a]: RGBA) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+(a / 255).toFixed(3)})`;
export const toHex = ([r, g, b]: RGBA) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const unlin = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055);

type Lab = [number, number, number];
function toLab(r: number, g: number, b: number): Lab {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromLab([L, A, B]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    unlin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, v));

/** Colour at value `v`; values outside the stops clamp to the first/last colour. */
export function sampleScale(scale: ColorScale, v: number): RGBA {
  const st = scale.stops;
  if (!st.length) return [0, 0, 0, 0];
  const first = st[0]!;
  const last = st[st.length - 1]!;
  if (!(v > first[0])) return parseColor(first[1]);
  if (v >= last[0]) return parseColor(last[1]);
  let i = 1;
  while (i < st.length - 1 && v > st[i]![0]) i++;
  const [v0, c0] = st[i - 1]!;
  const [v1, c1] = st[i]!;
  const t = (v - v0) / (v1 - v0);
  const a = parseColor(c0);
  const b = parseColor(c1);
  // fully transparent stops take the colour of their neighbour so alpha fades without darkening
  const ca = a[3] === 0 ? b : a;
  const cb = b[3] === 0 ? a : b;
  const la = toLab(ca[0], ca[1], ca[2]);
  const lb = toLab(cb[0], cb[1], cb[2]);
  const rgb = fromLab([la[0] + (lb[0] - la[0]) * t, la[1] + (lb[1] - la[1]) * t, la[2] + (lb[2] - la[2]) * t]);
  return [clamp255(rgb[0]), clamp255(rgb[1]), clamp255(rgb[2]), a[3] + (b[3] - a[3]) * t];
}

/** RGBA lookup table with `size` entries covering [min, max]. */
export function buildLut(scale: ColorScale, min: number, max: number, size = 256): Uint8Array {
  const out = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const c = sampleScale(scale, min + ((max - min) * i) / (size - 1));
    out[i * 4] = Math.round(c[0]);
    out[i * 4 + 1] = Math.round(c[1]);
    out[i * 4 + 2] = Math.round(c[2]);
    out[i * 4 + 3] = Math.round(c[3]);
  }
  return out;
}

export const scaleRange = (s: ColorScale): [number, number] => [s.stops[0]![0], s.stops[s.stops.length - 1]![0]];

/** Legend spec stops (value, css colour) sampled evenly, for gradient bars. */
export function legendStops(scale: ColorScale, n = 12): [number, string][] {
  const [min, max] = scaleRange(scale);
  return Array.from({ length: n }, (_, i) => {
    const v = min + ((max - min) * i) / (n - 1);
    return [v, toCss(sampleScale(scale, v))] as [number, string];
  });
}

// ---- named data scales (base units) ---------------------------------------
// Tuned to read on the dark basemap and on satellite imagery: mid-lightness, no neon, calm saturation.

/** °C, diverging around 0 °C: violet/blue cold, pale at freezing, green/yellow mild, orange/red hot. */
export const TEMPERATURE: ColorScale = {
  unit: '°C',
  ticks: [-40, -20, 0, 10, 20, 30, 40],
  stops: [
    [-40, '#3a1c71'], [-30, '#3f3fb0'], [-20, '#2f6bd1'], [-10, '#3fa3e6'], [-2, '#9ad8f0'], [0, '#e2f3f4'],
    [4, '#bde4b2'], [10, '#a2d86e'], [16, '#e5df6c'], [22, '#f7b84a'], [28, '#ef7b3a'], [34, '#d8432f'], [40, '#a3202f'], [45, '#6e1236'],
  ],
};

/** km/h, sequential; calm air stays see-through. */
export const WIND: ColorScale = {
  unit: 'km/h',
  ticks: [0, 20, 40, 60, 80, 100, 120],
  stops: [
    [0, 'rgba(58, 52, 140, 0.25)'], [5, 'rgba(63, 79, 181, 0.7)'], [15, '#3a86d1'], [25, '#3fb8c0'], [35, '#6fd19a'],
    [50, '#c8e57a'], [65, '#f3d76a'], [80, '#f0a050'], [100, '#d9605a'], [120, '#a02f68'],
  ],
};

/** km/h gusts, longer than WIND. */
export const GUSTS: ColorScale = {
  unit: 'km/h',
  ticks: [0, 30, 60, 90, 120, 150],
  stops: [
    [0, 'rgba(58, 52, 140, 0.25)'], [10, 'rgba(63, 79, 181, 0.7)'], [30, '#3a86d1'], [45, '#3fb8c0'], [60, '#9fd98a'],
    [75, '#f3e07a'], [90, '#f0a050'], [105, '#d9605a'], [120, '#b03a74'], [140, '#7a2f8f'], [160, '#e4d8f0'],
  ],
};

/** mm/h, blue to violet, then warm for extremes; invisible below 0.1. */
export const PRECIP: ColorScale = {
  unit: 'mm/h',
  ticks: [0.1, 0.5, 1, 2.5, 5, 10, 20, 30],
  stops: [
    [0.1, 'rgba(140, 200, 255, 0)'], [0.15, 'rgba(140, 200, 255, 0.55)'], [0.5, '#6fb0f7'], [1, '#4a78e6'], [2.5, '#5a52d4'],
    [5, '#a448c0'], [10, '#e0406a'], [20, '#ff9a3a'], [30, '#fff0a0'],
  ],
};

/** %, transparent clear sky to white overcast. */
export const CLOUD: ColorScale = {
  unit: '%',
  ticks: [0, 25, 50, 75, 100],
  stops: [[0, 'rgba(255, 255, 255, 0)'], [20, 'rgba(235, 242, 252, 0.12)'], [50, 'rgba(235, 242, 252, 0.45)'], [80, 'rgba(245, 248, 255, 0.75)'], [100, 'rgba(255, 255, 255, 0.9)']],
};

/** hPa, diverging around 1013. */
export const PRESSURE: ColorScale = {
  unit: 'hPa',
  ticks: [960, 980, 1000, 1013, 1030, 1050],
  stops: [[960, '#5b2bd6'], [985, '#2f7fd8'], [1000, '#4fc3e8'], [1013, '#e6ebf2'], [1022, '#f6c945'], [1035, '#e0462f'], [1050, '#9e1a3a']],
};

/** m snow depth. */
export const SNOW: ColorScale = {
  unit: 'm',
  ticks: [0, 0.25, 0.5, 1, 2],
  stops: [[0, 'rgba(220, 235, 255, 0)'], [0.02, 'rgba(220, 235, 255, 0.35)'], [0.1, '#b6c8ff'], [0.3, '#9a9cf0'], [0.6, '#b27be8'], [1, '#d66bd0'], [2, '#ffd0f0']],
};

/** J/kg convective energy. */
export const CAPE: ColorScale = {
  unit: 'J/kg',
  ticks: [0, 500, 1000, 2000, 3000, 4000],
  stops: [[0, 'rgba(127, 214, 160, 0)'], [100, 'rgba(127, 214, 160, 0.3)'], [250, '#7fd6a0'], [500, '#d5e86a'], [1000, '#f5c542'], [2000, '#ee7b36'], [3000, '#d6304a'], [4000, '#a0207f']],
};

/** % relative humidity, dry brown to wet blue. */
export const HUMIDITY: ColorScale = {
  unit: '%',
  ticks: [0, 25, 50, 75, 100],
  stops: [[0, '#8c4a1c'], [25, '#c98a3d'], [45, '#e8d6a0'], [65, '#8fd0c6'], [80, '#3d9ad1'], [100, '#1d4fa6']],
};

export const SCALES = { TEMPERATURE, WIND, GUSTS, PRECIP, CLOUD, PRESSURE, SNOW, CAPE, HUMIDITY } as const;
export type ScaleName = keyof typeof SCALES;
