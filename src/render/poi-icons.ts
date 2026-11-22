// The badges of the map's points of interest (map/poi.ts): a saturated disc or rounded square with a white glyph, like
// the icons of Apple Maps. They are raster images, not SDF shapes, because the badge and the glyph have different colours
// (coloured badge, white glyph); MapLibre's `icon-color` would tint both. Redrawn per badge size class only when the map
// asks for an image that is not loaded yet (`styleimagemissing`), so a style reload cannot leave places without icons.
import type { Map as MlMap } from 'maplibre-gl';
import { POI_GLYPHS } from './poi-icon-paths';

export interface PoiIconSpec {
  /** Image name: `poi-<group>-<glyph>`, or `poi-other` for the neutral fallback. */
  id: string;
  /** Key into POI_GLYPHS (Material Symbols, 960 grid). */
  glyph: string;
  /** Badge colour as `#rrggbb`. */
  color: string;
  /** Apple's holders: a disc for most kinds, a rounded square for transport. */
  shape: 'circle' | 'rounded';
}

/** Canvas pixels; registered at pixelRatio 2, so one image pixel is half a CSS pixel. */
const SIZE = 64;
/** The badge itself, leaving room for the soft shadow around it. */
const BADGE = 56;
/** Glyph edge as a share of the badge: Apple's symbols fill a little more than half of the disc. */
const GLYPH = 0.62;

const hex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#969696');
const channel = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
/** Mixes a colour towards white (`k > 0`) or black (`k < 0`). */
function shade(c: string, k: number): string {
  const v = [0, 1, 2].map((i) => {
    const x = channel(c, i);
    return Math.round(k >= 0 ? x + (255 - x) * k : x * (1 + k));
  });
  return `rgb(${v[0]}, ${v[1]}, ${v[2]})`;
}

/** Circle, or the rounded square Apple gives transport: the same size, only the corners differ. */
function holder(g: CanvasRenderingContext2D, shape: PoiIconSpec['shape']): void {
  const r = BADGE / 2;
  const c = SIZE / 2;
  g.beginPath();
  if (shape === 'circle') {
    g.arc(c, c, r, 0, Math.PI * 2);
    return;
  }
  const x = c - r;
  const radius = 15;
  g.moveTo(x + radius, x);
  g.arcTo(x + BADGE, x, x + BADGE, x + BADGE, radius);
  g.arcTo(x + BADGE, x + BADGE, x, x + BADGE, radius);
  g.arcTo(x, x + BADGE, x, x, radius);
  g.arcTo(x, x, x + BADGE, x, radius);
  g.closePath();
}

function draw(spec: PoiIconSpec): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d')!;
  const color = hex(spec.color);

  // Soft contact shadow: enough to lift the badge off a bright street map, not a drop-shadow effect.
  g.save();
  g.shadowColor = 'rgba(8, 12, 20, 0.42)';
  g.shadowBlur = 2.6;
  g.shadowOffsetY = 1;
  const body = g.createLinearGradient(0, (SIZE - BADGE) / 2, 0, (SIZE + BADGE) / 2);
  body.addColorStop(0, shade(color, 0.12));
  body.addColorStop(1, shade(color, -0.1));
  holder(g, spec.shape);
  g.fillStyle = body;
  g.fill();
  g.restore();

  // A hairline of light on the rim reads as curvature, like Apple's glossy badges.
  g.save();
  holder(g, spec.shape);
  g.strokeStyle = 'rgba(255, 255, 255, 0.34)';
  g.lineWidth = 0.8;
  g.stroke();
  g.restore();

  const path = POI_GLYPHS[spec.glyph];
  if (path) {
    const box = BADGE * GLYPH;
    const s = box / 960;
    g.save();
    holder(g, spec.shape);
    g.clip();
    g.translate(SIZE / 2, SIZE / 2);
    g.scale(s, s);
    // Material paths sit in a 960 box whose origin is top-left and whose y runs from -960 to 0.
    g.translate(-480, 480);
    g.fillStyle = '#fff';
    g.fill(new Path2D(path));
    g.restore();
  }
  return g.getImageData(0, 0, SIZE, SIZE);
}

/** Draws the badge and returns the canvas (for a visual check of the whole set). */
export function poiIconCanvas(spec: PoiIconSpec): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  canvas.getContext('2d')!.putImageData(draw(spec), 0, 0);
  return canvas;
}

const specs = new Map<string, PoiIconSpec>();
const hooked = new WeakSet<MlMap>();

/** Registers one badge unless the style already has it. */
export function registerPoiIcon(ml: MlMap, spec: PoiIconSpec): void {
  if (ml.hasImage(spec.id)) return;
  ml.addImage(spec.id, draw(spec), { pixelRatio: 2 });
}

/**
 * Registers the POI badges on this map and keeps the specs around: when a style reload asks for one that is gone, it is
 * drawn again. Safe to call more than once.
 */
export function ensurePoiIcons(ml: MlMap, icons: readonly PoiIconSpec[] = []): void {
  for (const icon of icons) specs.set(icon.id, icon);
  if (!hooked.has(ml)) {
    hooked.add(ml);
    ml.on('styleimagemissing', (e) => {
      const spec = specs.get(e.id);
      if (spec) registerPoiIcon(ml, spec);
    });
  }
  for (const icon of icons) registerPoiIcon(ml, icon);
}
