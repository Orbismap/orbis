// Small colour glyphs of the city weather labels, drawn with canvas 2D (no image files): sun, moon, partly cloudy,
// cloud, rain, snow. 48 × 48 px for pixelRatio 2.
import type { Cond } from './cityweather';

export const CITY_ICON_SIZE = 48;
export const cityIconId = (c: Cond) => `wxc-${c}`;

type Ctx = CanvasRenderingContext2D;

function sun(g: Ctx, x: number, y: number, r: number) {
  g.strokeStyle = '#FFC93C';
  g.lineWidth = 3;
  g.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3));
    g.lineTo(x + Math.cos(a) * (r + 7), y + Math.sin(a) * (r + 7));
    g.stroke();
  }
  g.fillStyle = '#FFD65A';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function moon(g: Ctx, x: number, y: number, r: number) {
  g.fillStyle = '#E8ECF8';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(x + r * 0.55, y - r * 0.35, r * 0.85, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';
}

function cloud(g: Ctx, x: number, y: number, s: number, fill = '#F1F5FB', stroke = 'rgba(10,15,24,0.55)') {
  const p = () => {
    g.beginPath();
    g.arc(x - 9 * s, y + 2 * s, 7 * s, Math.PI * 0.5, Math.PI * 1.5);
    g.arc(x - 2 * s, y - 5 * s, 9 * s, Math.PI, Math.PI * 1.9);
    g.arc(x + 9 * s, y + 1 * s, 7 * s, Math.PI * 1.5, Math.PI * 0.5);
    g.closePath();
  };
  p();
  g.lineWidth = 2.5;
  g.strokeStyle = stroke;
  g.stroke();
  g.fillStyle = fill;
  p();
  g.fill();
}

/** RGBA pixels of a condition glyph. */
export function drawCityIcon(c: Cond): ImageData {
  const cv = document.createElement('canvas');
  cv.width = cv.height = CITY_ICON_SIZE;
  const g = cv.getContext('2d')!;
  const m = CITY_ICON_SIZE / 2;
  switch (c) {
    case 'clear': sun(g, m, m, 9); break;
    case 'clear-night': moon(g, m, m, 12); break;
    case 'partly': sun(g, m - 7, m - 6, 7); cloud(g, m + 3, m + 6, 0.95); break;
    case 'partly-night': moon(g, m - 7, m - 6, 8); cloud(g, m + 3, m + 6, 0.95); break;
    case 'cloud': cloud(g, m, m + 1, 1.25, '#C9D3E2'); break;
    case 'rain':
      cloud(g, m, m - 5, 1.1, '#AEBCD2');
      g.strokeStyle = '#5BB8FF';
      g.lineWidth = 3;
      g.lineCap = 'round';
      for (const dx of [-9, 0, 9]) { g.beginPath(); g.moveTo(m + dx, m + 8); g.lineTo(m + dx - 3, m + 16); g.stroke(); }
      break;
    case 'snow':
      cloud(g, m, m - 5, 1.1, '#C9D3E2');
      g.fillStyle = '#FFFFFF';
      for (const dx of [-9, 0, 9]) { g.beginPath(); g.arc(m + dx, m + 13 + (dx === 0 ? 3 : 0), 2.6, 0, Math.PI * 2); g.fill(); }
      break;
  }
  return g.getImageData(0, 0, CITY_ICON_SIZE, CITY_ICON_SIZE);
}
