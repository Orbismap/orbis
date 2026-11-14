// Lane arrows painted on the road (white, drawn with canvas 2D, 64 × 64 px for pixelRatio 2). Keys: the directions of a
// lane in the order l, s, r: 's' straight, 'l' left, 'r' right, 'ls', 'sr', 'lr', 'lsr'. All point up (north) and are
// rotated by the layer to the lane heading.
import type { Map as MlMap } from 'maplibre-gl';

export const ARROW_KEYS = ['s', 'l', 'r', 'ls', 'sr', 'lr', 'lsr'] as const;
export const arrowId = (key: string) => `rm-arrow-${key}`;
const SIZE = 64;

type Ctx = CanvasRenderingContext2D;
type XY = [number, number];

function head(g: Ctx, x: number, y: number, angle: number) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.beginPath();
  g.moveTo(0, -14);
  g.lineTo(13, 7);
  g.lineTo(-13, 7);
  g.closePath();
  g.fill();
  g.restore();
}

/** Stem from `from` to the point where the head starts, optionally curved through `ctrl`. */
function path(g: Ctx, from: XY, to: XY, ctrl?: XY) {
  g.beginPath();
  g.moveTo(...from);
  if (ctrl) g.quadraticCurveTo(ctrl[0], ctrl[1], to[0], to[1]);
  else g.lineTo(...to);
  g.stroke();
  const [cx, cy] = ctrl ?? from;
  head(g, to[0], to[1], Math.atan2(to[0] - cx, -(to[1] - cy)));
}

export function drawArrow(key: string): ImageData {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  g.fillStyle = g.strokeStyle = '#ffffff';
  g.lineWidth = 7;
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
  const straight = key.includes('s');
  const branches = [...key].filter((k) => k !== 's');
  const x0 = 32;
  if (straight) {
    path(g, [x0, 62], [x0, 22]);
    for (const b of branches) {
      const d = b === 'l' ? -1 : 1;
      path(g, [x0, 46], [x0 + d * 15, 32], [x0, 36]);
    }
  } else if (branches.length === 1) {
    const d = branches[0] === 'l' ? -1 : 1;
    path(g, [x0 - d * 4, 62], [x0 + d * 14, 26], [x0 - d * 4, 34]);
  } else {
    // left + right without straight: a fork
    path(g, [x0, 62], [x0, 44]);
    path(g, [x0, 48], [x0 - 15, 28], [x0, 36]);
    path(g, [x0, 48], [x0 + 15, 28], [x0, 36]);
  }
  return g.getImageData(0, 0, SIZE, SIZE);
}

export function addArrowIcons(ml: MlMap) {
  for (const k of ARROW_KEYS) if (!ml.hasImage(arrowId(k))) ml.addImage(arrowId(k), drawArrow(k), { pixelRatio: 2 });
}
