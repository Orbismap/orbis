import { sunAltitude } from '../../core/geo';
import { DAY, HOUR, startOfDay } from '../../core/time';
import { formatDayLabel, formatShort, hourStep } from './math';

export interface Mark { t: number; color: string }
export interface DrawState {
  w: number;
  h: number;
  start: number;
  end: number;
  frames?: number[];
  now: number;
  time: number;
  live: boolean;
  centre: { lng: number; lat: number };
  marks: Mark[];
  hoverX: number | null;
  compact: boolean;
}

interface Palette { dark: boolean; text1: string; text2: string; text3: string; now: string; line: string; ink0: string }

export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return { dark: cs.colorScheme.includes('dark') || !cs.colorScheme.includes('light'), text1: v('--text-1'), text2: v('--text-2'), text3: v('--text-3'), now: v('--now'), line: v('--line'), ink0: v('--ink-0') };
}

const FONT = '500 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif';

/** Night factor 0 (night) .. 1 (day) from the sun's elevation; civil twilight is the soft edge. */
const dayness = (alt: number) => Math.min(1, Math.max(0, (alt + 6) / 12));

let markCache: { key: string; bins: Map<string, number[]> } | undefined;
/** Mark density per 3 px bin and colour; cached while inputs stay identical. */
function bin(marks: Mark[], s: DrawState, x: (t: number) => number) {
  const key = `${marks.length}|${marks[0]?.t}|${marks[marks.length - 1]?.t}|${s.start}|${s.end}|${s.w}`;
  if (markCache?.key === key) return markCache.bins;
  const bins = new Map<string, number[]>();
  for (const m of marks) {
    if (m.t < s.start || m.t > s.end) continue;
    const b = Math.floor(x(m.t) / 3);
    let arr = bins.get(m.color);
    if (!arr) bins.set(m.color, (arr = []));
    arr[b] = (arr[b] ?? 0) + 1;
  }
  markCache = { key, bins };
  return bins;
}

export function drawTimeline(g: CanvasRenderingContext2D, s: DrawState, p: Palette): void {
  const { w, h } = s;
  const span = s.end - s.start || 1;
  const x = (t: number) => ((t - s.start) / span) * w;
  g.clearRect(0, 0, w, h);

  // day / night shading for the map centre
  const colStep = 2;
  for (let px = 0; px < w; px += colStep) {
    const t = s.start + ((px + colStep / 2) / w) * span;
    const d = dayness(sunAltitude(s.centre.lng, s.centre.lat, t));
    if (p.dark) g.fillStyle = `rgba(2, 5, 12, ${(0.36 * (1 - d)).toFixed(3)})`;
    else g.fillStyle = `rgba(30, 50, 100, ${(0.13 * (1 - d)).toFixed(3)})`;
    g.fillRect(px, 0, colStep, h);
    if (d > 0.5) {
      g.fillStyle = p.dark ? `rgba(255, 255, 255, ${(0.045 * (d - 0.5) * 2).toFixed(3)})` : `rgba(255, 255, 255, ${(0.2 * (d - 0.5) * 2).toFixed(3)})`;
      g.fillRect(px, 0, colStep, h);
    }
  }

  const labelBase = 11;
  const bottom = h - 4;
  g.font = FONT;
  g.textBaseline = 'alphabetic';

  // hour ticks
  const pxPerHour = (w / span) * HOUR;
  const step = hourStep(pxPerHour, s.compact ? 26 : 30);
  const firstHour = Math.ceil(s.start / HOUR) * HOUR;
  g.lineWidth = 1;
  for (let t = firstHour; t <= s.end; t += HOUR) {
    const hr = new Date(t).getHours();
    const major = step > 0 && hr % step === 0;
    if (!major && pxPerHour < 7) continue;
    const px = Math.round(x(t)) + 0.5;
    g.strokeStyle = p.text3;
    g.globalAlpha = major ? 0.7 : 0.3;
    g.beginPath();
    g.moveTo(px, bottom - (major ? 4 : 2));
    g.lineTo(px, bottom);
    g.stroke();
    if (major && hr !== 0 && px > 8 && px < w - 8) {
      g.globalAlpha = 1;
      g.fillStyle = p.text3;
      g.textAlign = 'center';
      g.fillText(String(hr), px, bottom - 6);
    }
  }
  g.globalAlpha = 1;

  // day boundaries and labels
  const days: number[] = [];
  for (let d = startOfDay(s.start); d <= s.end + DAY; d = startOfDay(d + DAY + 3 * HOUR)) days.push(d);
  g.textAlign = 'left';
  days.forEach((d, i) => {
    const px = x(d);
    if (px > 1 && px < w - 1) {
      g.strokeStyle = p.line;
      g.globalAlpha = 0.9;
      g.beginPath();
      g.moveTo(Math.round(px) + 0.5, 0);
      g.lineTo(Math.round(px) + 0.5, h);
      g.stroke();
      g.globalAlpha = 1;
    }
    const next = days[i + 1] !== undefined ? x(days[i + 1]!) : Infinity;
    const lx = Math.max(px + 5, 5);
    const text = formatDayLabel(d + 12 * HOUR, new Date(d + 12 * HOUR).getDate() === 1 || i === 0);
    if (next - lx > g.measureText(text).width + 8 && px < w - 20) {
      g.fillStyle = p.text2;
      g.fillText(text, lx, labelBase);
    }
  });

  // frame ticks
  if (s.frames?.length && w / s.frames.length >= 2.5) {
    g.fillStyle = p.text2;
    g.globalAlpha = 0.4;
    for (const f of s.frames) if (f >= s.start && f <= s.end) g.fillRect(Math.round(x(f)), 16, 1, 3);
    g.globalAlpha = 1;
  }

  // feed marks: stacked, coloured by layer, height by density
  const bins = bin(s.marks, s, x);
  const base = bottom - (step > 0 ? 14 : 4);
  const stack = new Float32Array(Math.ceil(w / 3) + 1);
  g.globalAlpha = 0.92;
  for (const [color, arr] of bins) {
    g.fillStyle = color;
    arr.forEach((c, b) => {
      if (!c) return;
      const ht = Math.min(10, 3 + Math.log2(c + 1) * 2.4);
      const y = base - stack[b]! - ht;
      if (y < 20) return;
      g.fillRect(b * 3, y, 2, ht);
      stack[b]! += ht + 1;
    });
  }
  g.globalAlpha = 1;

  // now line (amber): time, nothing else
  const nx = x(s.now);
  if (nx >= 0 && nx <= w) {
    g.fillStyle = p.now;
    g.fillRect(Math.round(nx) - 0.5, 0, 1.5, h);
    g.beginPath();
    g.moveTo(nx - 4, 0);
    g.lineTo(nx + 4, 0);
    g.lineTo(nx, 5);
    g.closePath();
    g.fill();
  }

  // hover guide
  if (s.hoverX !== null) {
    g.fillStyle = p.text2;
    g.globalAlpha = 0.5;
    g.fillRect(Math.round(s.hoverX), 0, 1, h);
    g.globalAlpha = 1;
  }

  // handle: pill on the selected time (amber while live)
  const hx = Math.min(w - 4, Math.max(4, x(s.time)));
  g.fillStyle = s.live ? p.now : p.text1;
  g.fillRect(Math.round(hx) - 0.75, 0, 1.5, h);
  const ph = Math.min(22, h - 8);
  const py = (h - ph) / 2 + 1;
  g.beginPath();
  g.roundRect(hx - 3.5, py, 7, ph, 3.5);
  g.fillStyle = s.live ? p.now : p.text1;
  g.strokeStyle = p.ink0;
  g.lineWidth = 1.5;
  g.stroke();
  g.fill();

  // small screens: the readout of the handle sits in the band (the desktop readout is above it)
  if (s.compact && !s.live) {
    const label = formatShort(s.time);
    const tw = g.measureText(label).width + 12;
    const lx = Math.min(w - tw - 2, Math.max(2, hx - tw / 2));
    g.fillStyle = p.text1;
    g.beginPath();
    g.roundRect(lx, 1, tw, 15, 7.5);
    g.fill();
    g.fillStyle = p.ink0;
    g.textAlign = 'left';
    g.fillText(label, lx + 6, 12);
  }
}
