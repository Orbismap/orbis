// Runtime-generated SDF map icons. Shapes are drawn in white on a canvas, converted to a signed distance field and
// registered with `sdf: true`, so `icon-color` and `icon-halo-*` can colour them. Registered on demand.
import type { Map as MlMap } from 'maplibre-gl';

type Draw = (g: CanvasRenderingContext2D) => void; // draws in the unit square (0..1)

const poly = (pts: [number, number][]): Draw => (g) => {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
};

const star = (): Draw => (g) => {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.2 : 0.5;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = 0.5 + r * Math.cos(a);
    const y = 0.53 + r * Math.sin(a);
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
  g.fill();
};

export const SHAPES = {
  dot: (g) => {
    g.beginPath();
    g.arc(0.5, 0.5, 0.5, 0, Math.PI * 2);
    g.fill();
  },
  triangle: poly([[0.5, 0.04], [0.98, 0.94], [0.02, 0.94]]),
  arrow: poly([[0.5, 0], [1, 1], [0.5, 0.74], [0, 1]]),
  plane: poly([[0.5, 0], [0.56, 0.12], [0.57, 0.36], [0.98, 0.62], [0.98, 0.72], [0.57, 0.58], [0.55, 0.86], [0.68, 0.95], [0.68, 1], [0.5, 0.95], [0.32, 1], [0.32, 0.95], [0.45, 0.86], [0.43, 0.58], [0.02, 0.72], [0.02, 0.62], [0.43, 0.36], [0.44, 0.12]]),
  ship: poly([[0.5, 0], [0.78, 0.28], [0.78, 0.92], [0.7, 1], [0.3, 1], [0.22, 0.92], [0.22, 0.28]]),
  diamond: poly([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]),
  square: poly([[0.08, 0.08], [0.92, 0.08], [0.92, 0.92], [0.08, 0.92]]),
  star: star(),
  bolt: poly([[0.6, 0], [0.12, 0.56], [0.44, 0.56], [0.34, 1], [0.88, 0.38], [0.55, 0.38]]),
  flame: (g) => {
    g.beginPath();
    g.moveTo(0.5, 0);
    g.bezierCurveTo(0.55, 0.25, 0.9, 0.4, 0.9, 0.68);
    g.bezierCurveTo(0.9, 0.88, 0.72, 1, 0.5, 1);
    g.bezierCurveTo(0.28, 1, 0.1, 0.88, 0.1, 0.68);
    g.bezierCurveTo(0.1, 0.5, 0.25, 0.42, 0.32, 0.28);
    g.bezierCurveTo(0.38, 0.4, 0.42, 0.42, 0.46, 0.36);
    g.bezierCurveTo(0.5, 0.25, 0.45, 0.12, 0.5, 0);
    g.closePath();
    g.fill();
  },
  volcano: poly([[0, 1], [0.34, 0.24], [0.44, 0.34], [0.56, 0.34], [0.66, 0.24], [1, 1]]),
  tower: poly([[0.5, 0], [0.58, 0.68], [0.86, 1], [0.14, 1], [0.42, 0.68]]),
  camera: (g) => {
    g.beginPath();
    g.rect(0.04, 0.26, 0.92, 0.64);
    g.rect(0.3, 0.12, 0.4, 0.16);
    g.moveTo(0.5 + 0.2, 0.58);
    g.arc(0.5, 0.58, 0.2, 0, Math.PI * 2, true);
    g.fill('evenodd');
  },
  // viewing cone of a camera: tip in the centre, opens upwards (rotate by the bearing), ±30°
  fov: (g) => {
    g.beginPath();
    g.moveTo(0.5, 0.5);
    g.arc(0.5, 0.5, 0.5, (-90 - 30) * (Math.PI / 180), (-90 + 30) * (Math.PI / 180));
    g.closePath();
    g.fill();
  },
  rocket: poly([[0.5, 0], [0.68, 0.2], [0.68, 0.64], [0.86, 0.84], [0.86, 1], [0.6, 0.88], [0.4, 0.88], [0.14, 1], [0.14, 0.84], [0.32, 0.64], [0.32, 0.2]]),
  satellite: (g) => {
    g.beginPath();
    g.rect(0.38, 0.38, 0.24, 0.24); // body
    g.rect(0.0, 0.4, 0.3, 0.2); // solar panels
    g.rect(0.7, 0.4, 0.3, 0.2);
    g.rect(0.3, 0.485, 0.08, 0.03); // booms
    g.rect(0.62, 0.485, 0.08, 0.03);
    g.rect(0.485, 0.18, 0.03, 0.2); // antenna
    g.fill();
  },
  balloon: (g) => {
    g.beginPath();
    g.arc(0.5, 0.36, 0.34, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(0.22, 0.52);
    g.lineTo(0.5, 0.8);
    g.lineTo(0.78, 0.52);
    g.closePath();
    g.fill();
    g.fillRect(0.42, 0.8, 0.16, 0.18);
  },
  turbine: (g) => {
    g.beginPath(); // tower
    g.moveTo(0.46, 0.46);
    g.lineTo(0.54, 0.46);
    g.lineTo(0.6, 1);
    g.lineTo(0.4, 1);
    g.closePath();
    g.fill();
    for (let k = 0; k < 3; k++) {
      g.save();
      g.translate(0.5, 0.4);
      g.rotate((k * 2 * Math.PI) / 3);
      g.beginPath();
      g.moveTo(0, -0.4);
      g.lineTo(0.07, -0.04);
      g.lineTo(-0.07, -0.04);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.beginPath();
    g.arc(0.5, 0.4, 0.08, 0, Math.PI * 2);
    g.fill();
  },
  mast: (g) => {
    g.beginPath(); // lattice mast as an outlined narrow triangle
    g.moveTo(0.5, 0.2);
    g.lineTo(0.66, 1);
    g.lineTo(0.34, 1);
    g.closePath();
    g.moveTo(0.5, 0.42);
    g.lineTo(0.57, 0.88);
    g.lineTo(0.43, 0.88);
    g.closePath();
    g.fill('evenodd');
    g.beginPath(); // radio waves
    g.arc(0.5, 0.16, 0.2, Math.PI * 1.15, Math.PI * 1.85);
    g.moveTo(0.5 + 0.38 * Math.cos(Math.PI * 1.17), 0.16 + 0.38 * Math.sin(Math.PI * 1.17));
    g.arc(0.5, 0.16, 0.38, Math.PI * 1.17, Math.PI * 1.83);
    g.lineWidth = 0.07;
    g.lineCap = 'round';
    g.strokeStyle = '#fff';
    g.stroke();
    g.beginPath();
    g.arc(0.5, 0.16, 0.06, 0, Math.PI * 2);
    g.fill();
  },
} satisfies Record<string, Draw>;

export type IconShape = keyof typeof SHAPES;
export const ICON_NAMES = Object.keys(SHAPES) as IconShape[];
export const isIconShape = (n: string): n is IconShape => n in SHAPES;

const SIZE = 64; // canvas px (rendered at pixelRatio 2 -> 32 css px)
const BUFFER = 8;
const RADIUS = 8;
const CUTOFF = 0.25;
const INF = 1e20;

function edt1d(grid: Float64Array, offset: number, stride: number, n: number, f: Float64Array, v: Uint16Array, z: Float64Array) {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  f[0] = grid[offset]!;
  for (let q = 1, k = 0, s = 0; q < n; q++) {
    f[q] = grid[offset + q * stride]!;
    const q2 = q * q;
    do {
      const r = v[k]!;
      s = (f[q]! - f[r]! + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k]! && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const r = v[k]!;
    const qr = q - r;
    grid[offset + q * stride] = f[r]! + qr * qr;
  }
}

function edt(grid: Float64Array, w: number, h: number) {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const v = new Uint16Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) edt1d(grid, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, f, v, z);
}

/** Signed distance field (alpha 0..255, edge at 191) from an alpha mask. Same convention as glyph SDFs. */
export function sdfFromAlpha(alpha: ArrayLike<number>, w: number, h: number, radius = RADIUS, cutoff = CUTOFF): Uint8Array {
  const outer = new Float64Array(w * h);
  const inner = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = alpha[i]! / 255;
    outer[i] = a === 1 ? 0 : a === 0 ? INF : Math.max(0, 0.5 - a) ** 2;
    inner[i] = a === 1 ? INF : a === 0 ? 0 : Math.max(0, a - 0.5) ** 2;
  }
  edt(outer, w, h);
  edt(inner, w, h);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const d = Math.sqrt(outer[i]!) - Math.sqrt(inner[i]!);
    out[i] = Math.max(0, Math.min(255, Math.round(255 - 255 * (d / radius + cutoff))));
  }
  return out;
}

function renderIcon(name: IconShape): { width: number; height: number; data: Uint8Array } {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff';
  const u = SIZE - 2 * BUFFER;
  g.translate(BUFFER, BUFFER);
  g.scale(u, u);
  SHAPES[name](g);
  const px = g.getImageData(0, 0, SIZE, SIZE).data;
  const alpha = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3]!;
  const sdf = sdfFromAlpha(alpha, SIZE, SIZE);
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < sdf.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255;
    data[i * 4 + 3] = sdf[i]!;
  }
  return { width: SIZE, height: SIZE, data };
}

const hooked = new WeakSet<MlMap>();

/** Registers icons now (or all of them) and makes sure any other icon is registered when the style asks for it. */
export function ensureIcons(ml: MlMap, names: readonly string[] = []): void {
  if (!hooked.has(ml)) {
    hooked.add(ml);
    ml.on('styleimagemissing', (e) => {
      if (isIconShape(e.id)) registerIcon(ml, e.id);
    });
  }
  for (const n of names) if (isIconShape(n)) registerIcon(ml, n);
}

export function registerIcon(ml: MlMap, name: IconShape): void {
  if (ml.hasImage(name)) return;
  ml.addImage(name, renderIcon(name), { sdf: true, pixelRatio: 2 });
}

/** Icon size factor: 1 = 32 css px (the SDF canvas at pixelRatio 2). */
export const iconScale = (cssPx: number) => cssPx / 32;
