import type { TimeSpan } from '../../state/time-tracks';
import { buildAxis, formatShort, placeLabels } from './math';

/** Eine Zeile der Leiste: ein Datensatz. `density`: glatte Kurve der Ereignisse; `bars`: Balken, wo sich etwas tut. */
export type BandRow = { id: string; label: string; color: string } & ({ kind: 'density'; times: ArrayLike<number>; /** Farbe je Ereignis (wie in der Legende); ohne: Zeilenfarbe. */ colors?: ArrayLike<string> } | { kind: 'bars'; active: TimeSpan[] });

export interface DrawState {
  w: number;
  h: number;
  start: number;
  end: number;
  frames?: number[];
  now: number;
  time: number;
  live: boolean;
  rows: BandRow[];
  collapsed: boolean;
  /** Größe der Zeilen (1 = normal). */
  scale: number;
  hover: { x: number; y: number } | null;
  compact: boolean;
}

// Ohne Daten: eine dünne Leiste mit Beschriftung darunter. Mit Daten: Spuren statt der Leiste, leere Ebenen entfallen,
// punktuelle Ereignisse teilen sich eine Spur, dichte Ebenen bekommen je eine Kurve, Zeiträume je eine Balkenzeile.
const AXIS = 24;
const PAD = 4;
const GAP = 2;
const CURVE_H = 30;
const SPARSE_H = 16;
const SUMMARY_H = 22;
const BARS_H = 10;
const BARSUM_H = 10;
const BAR_Y = 8;
const BAR_H = 6;
/** Bis zu so vielen sichtbaren Ereignissen zählt eine Ebene als punktuell (Striche in der gemeinsamen Spur). */
const SPARSE_MAX = 80;

type DenseRow = BandRow & { kind: 'density' };
type BarsRow = BandRow & { kind: 'bars' };
export type Lane =
  | { kind: 'curve'; row: DenseRow }
  | { kind: 'sparse'; rows: DenseRow[] }
  | { kind: 'bars'; row: BarsRow }
  | { kind: 'summary'; dense: DenseRow[]; sparse: DenseRow[] }
  | { kind: 'barsum'; rows: BarsRow[] };

const countCache = new WeakMap<BandRow, { key: string; n: number }>();
/** Ereignisse (bei Balkenzeilen: Zeiträume) einer Zeile im sichtbaren Ausschnitt. */
function countIn(row: BandRow, start: number, end: number): number {
  const key = `${start}|${end}`;
  const hit = countCache.get(row);
  if (hit?.key === key) return hit.n;
  let n = 0;
  if (row.kind === 'density') {
    for (let i = 0; i < row.times.length; i++) {
      const t = row.times[i]!;
      if (t >= start && t <= end) n++;
    }
  } else n = row.active.filter((a) => a.end >= start && a.start <= end).length;
  countCache.set(row, { key, n });
  return n;
}

/** Aus den Datensätzen die Spuren machen: leere weglassen, punktuelle zusammenlegen, eingeklappt noch weiter zusammenfassen. */
export function layoutLanes(rows: readonly BandRow[], start: number, end: number, collapsed: boolean, compact: boolean): Lane[] {
  const dense: DenseRow[] = [];
  const sparse: DenseRow[] = [];
  const bars: BarsRow[] = [];
  for (const r of rows) {
    const n = countIn(r, start, end);
    if (!n) continue;
    if (r.kind === 'bars') bars.push(r);
    else if (n <= SPARSE_MAX) sparse.push(r);
    else dense.push(r);
  }
  if (compact) return dense.length || sparse.length ? [{ kind: 'summary', dense, sparse }] : [];
  if (collapsed) {
    const lanes: Lane[] = [];
    if (dense.length || sparse.length) lanes.push({ kind: 'summary', dense, sparse });
    if (bars.length) lanes.push({ kind: 'barsum', rows: bars });
    return lanes;
  }
  const lanes: Lane[] = dense.map((row): Lane => ({ kind: 'curve', row }));
  if (sparse.length) lanes.push({ kind: 'sparse', rows: sparse });
  for (const row of bars) lanes.push({ kind: 'bars', row });
  return lanes;
}

const BASE_H: Record<Lane['kind'], [number, number]> = { curve: [CURVE_H, 12], sparse: [SPARSE_H, 9], bars: [BARS_H, 4], summary: [SUMMARY_H, 12], barsum: [BARSUM_H, 4] };
const laneHeight = (l: Lane, scale: number) => Math.round(Math.max(BASE_H[l.kind][1], BASE_H[l.kind][0] * scale));

/** Höhe der Leiste: dünn ohne Daten, sonst die Summe der Spuren. */
export function bandHeight(rows: readonly BandRow[], start: number, end: number, collapsed: boolean, scale: number, compact: boolean): number {
  if (compact) return 52;
  const lanes = layoutLanes(rows, start, end, collapsed, false);
  if (!lanes.length) return BAR_Y + BAR_H + AXIS;
  return PAD + lanes.reduce((h, l) => h + laneHeight(l, scale) + GAP, 0) + AXIS - GAP;
}

interface Palette { dark: boolean; text1: string; text2: string; text3: string; now: string; line: string; ink0: string }

export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return { dark: cs.colorScheme.includes('dark') || !cs.colorScheme.includes('light'), text1: v('--text-1'), text2: v('--text-2'), text3: v('--text-3'), now: v('--now'), line: v('--line'), ink0: v('--ink-0') };
}

const FONT_BOLD = '600 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif';
const FONT = '500 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif';

const SIGMA = 3.5;
const KERNEL = (() => {
  const r = Math.ceil(SIGMA * 3);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * SIGMA * SIGMA)));
  const sum = k.reduce((a, b) => a + b, 0);
  return { r, w: k.map((v) => v / sum) };
})();

const densityCache = new WeakMap<BandRow, { key: string; arr: Float32Array; norm: number; count: number }>();
/**
 * Dichte der Ereignisse als glatte Kurve: ein Zähler je Pixel, mit einem Gauß-Kern geglättet. Die Glättung hängt nur von Pixeln
 * ab, die Höhe wird auf das Maximum bezogen, so flackert die Kurve bei anderer Breite nicht.
 */
function density(row: BandRow & { kind: 'density' }, s: DrawState, x: (t: number) => number) {
  const key = `${s.start}|${s.end}|${s.w}`;
  const hit = densityCache.get(row);
  if (hit?.key === key) return hit;
  const n = Math.ceil(s.w);
  const raw = new Float32Array(n);
  let count = 0;
  for (let i = 0; i < row.times.length; i++) {
    const t = row.times[i]!;
    if (t < s.start || t > s.end) continue;
    count++;
    raw[Math.min(n - 1, Math.floor(x(t)))]!++;
  }
  const arr = new Float32Array(n);
  const { r, w } = KERNEL;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const c = raw[i]!;
    if (!c) continue;
    for (let j = -r; j <= r; j++) {
      const k = i + j;
      if (k >= 0 && k < n) arr[k]! += c * w[j + r]!;
    }
  }
  for (let i = 0; i < n; i++) if (arr[i]! > max) max = arr[i]!;
  // wenige Ereignisse bleiben flach, dichte Phasen ragen hoch
  const out = { key, arr, norm: Math.max(max, 0.35), count };
  densityCache.set(row, out);
  return out;
}

export function drawTimeline(g: CanvasRenderingContext2D, s: DrawState, p: Palette): void {
  const { w, h } = s;
  const span = s.end - s.start || 1;
  const x = (t: number) => ((t - s.start) / span) * w;
  const lanes = layoutLanes(s.rows, s.start, s.end, s.collapsed, s.compact);
  const bar = lanes.length === 0;
  const axisTop = h - AXIS;
  const axis = buildAxis(s.start, s.end, w, s.compact ? 42 : 46);
  g.clearRect(0, 0, w, h);
  g.font = FONT;
  g.textBaseline = 'alphabetic';
  g.lineWidth = 1;
  const barY = s.compact ? 22 : BAR_Y;

  // ---- Spuren mit Daten ----
  const laneTop: number[] = [];
  const laneH: number[] = [];
  const curve = (r: DenseRow, y: number, rh: number, soft: boolean) => {
    const { arr, norm } = density(r, s, x);
    const base = y + rh - 1;
    const zone = rh - 5;
    const py = (i: number) => base - zone * Math.min(1, arr[i]! / norm) ** 0.7;
    g.beginPath();
    g.moveTo(0, base);
    for (let i = 0; i < arr.length; i++) g.lineTo(i + 0.5, py(i));
    g.lineTo(arr.length, base);
    g.closePath();
    g.fillStyle = r.color;
    g.globalAlpha = soft ? 0.22 : 0.38;
    g.fill();
    g.beginPath();
    for (let i = 0; i < arr.length; i++) (i ? g.lineTo(i + 0.5, py(i)) : g.moveTo(0.5, py(i)));
    g.strokeStyle = r.color;
    g.lineWidth = 1.5;
    g.globalAlpha = soft ? 0.7 : 0.95;
    g.stroke();
  };
  const strokes = (r: DenseRow, y: number, rh: number) => {
    g.globalAlpha = 0.95;
    for (let i = 0; i < r.times.length; i++) {
      const t = r.times[i]!;
      if (t < s.start || t > s.end) continue;
      g.fillStyle = r.colors?.[i] ?? r.color;
      g.beginPath();
      g.roundRect(Math.round(x(t)) - 1, y, 2, rh, 1);
      g.fill();
    }
  };
  const bars = (r: BarsRow, y: number, rh: number, alpha: number) => {
    g.fillStyle = r.color;
    g.globalAlpha = alpha;
    for (const a of r.active) {
      const x0 = Math.max(0, x(a.start));
      const x1 = Math.min(w, x(a.end));
      if (x1 - x0 < 0.5) continue;
      g.beginPath();
      g.roundRect(x0, y, x1 - x0, rh, Math.min(3, rh / 2));
      g.fill();
    }
  };
  if (!bar) {
    let y = s.compact ? 3 : PAD;
    for (const lane of lanes) {
      const rh = s.compact ? axisTop - 3 - y : laneHeight(lane, s.scale);
      laneTop.push(y);
      laneH.push(rh);
      g.save();
      g.beginPath();
      g.roundRect(0, y, w, rh, 4);
      g.clip();
      g.fillStyle = p.text3;
      g.globalAlpha = 0.1;
      g.fillRect(0, y, w, rh);
      switch (lane.kind) {
        case 'curve': curve(lane.row, y, rh, false); break;
        case 'sparse': for (const r of lane.rows) strokes(r, y + 2, rh - 4); break;
        case 'bars': bars(lane.row, y + 1, Math.max(2, rh - 2), 0.9); break;
        case 'summary':
          for (const r of lane.dense) curve(r, y, rh, true);
          for (const r of lane.sparse) strokes(r, y + rh * 0.3, rh * 0.7 - 2);
          break;
        case 'barsum': for (const r of lane.rows) bars(r, y + 1, Math.max(2, rh - 2), 0.55); break;
      }
      g.restore();
      g.globalAlpha = 1;
      y += rh + GAP;
    }
  }

  // ---- dünne Leiste ohne Daten: Fortschritt bis zum Zeiger, Einkerbungen an den Marken ----
  const inset = bar ? 7 : 4;
  const hx = Math.min(w - inset, Math.max(inset, x(s.time)));
  if (bar) {
    g.fillStyle = p.text3;
    g.globalAlpha = 0.28;
    g.beginPath();
    g.roundRect(0, barY, w, BAR_H, BAR_H / 2);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = s.live ? p.now : p.text1;
    g.beginPath();
    g.roundRect(0, barY, Math.max(BAR_H, hx), BAR_H, BAR_H / 2);
    g.fill();
    g.fillStyle = p.ink0;
    g.globalAlpha = 0.85;
    for (const tk of axis.ticks) if (!tk.lead) g.fillRect(Math.round(x(tk.t)) - 0.5, barY, 1.5, BAR_H);
    g.globalAlpha = 1;
  } else {
    // Striche unter den Zeilen und die Grenzen der übergeordneten Einheit durch alle Zeilen
    g.strokeStyle = p.text3;
    g.globalAlpha = 0.28;
    g.beginPath();
    for (const t of axis.minor) {
      const px = Math.round(x(t)) + 0.5;
      g.moveTo(px, axisTop);
      g.lineTo(px, axisTop + 3);
    }
    g.stroke();
    g.globalAlpha = 0.55;
    g.beginPath();
    for (const tk of axis.ticks) {
      if (tk.major || tk.lead) continue;
      const px = Math.round(x(tk.t)) + 0.5;
      g.moveTo(px, axisTop);
      g.lineTo(px, axisTop + 6);
    }
    g.stroke();
    g.strokeStyle = p.line;
    g.globalAlpha = 0.9;
    g.beginPath();
    for (const tk of axis.ticks) {
      if (!tk.major || tk.lead) continue;
      const px = Math.round(x(tk.t)) + 0.5;
      g.moveTo(px, 0);
      g.lineTo(px, axisTop);
      g.moveTo(px, axisTop);
      g.lineTo(px, axisTop + 8);
    }
    g.stroke();
    g.globalAlpha = 1;
  }

  // ---- Beschriftungen unter der Leiste; "Jetzt" steht an seiner Stelle ----
  const ticks = [...axis.ticks];
  if (s.now >= s.start && s.now <= s.end) ticks.push({ t: s.now, labels: ['Jetzt'], major: true, lead: true });
  g.textAlign = 'left';
  for (const l of placeLabels(ticks, x, (t) => g.measureText(t).width, w)) {
    g.font = l.major ? FONT_BOLD : FONT;
    g.fillStyle = l.text === 'Jetzt' ? p.now : l.major ? p.text1 : p.text2;
    g.fillText(l.text, l.x, h - 8);
  }
  g.font = FONT;

  // Kartenzeiten (Frames) als Punkte über der Achse
  if (!bar && s.frames?.length && w / s.frames.length >= 2.5) {
    g.fillStyle = p.text2;
    g.globalAlpha = 0.4;
    for (const f of s.frames) if (f >= s.start && f <= s.end) g.fillRect(Math.round(x(f)), axisTop - 3, 1, 2);
    g.globalAlpha = 1;
  }

  // ---- Jetzt-Marke (bernstein): Linie durch die Zeilen, an der dünnen Leiste eine Kerbe ----
  const nx = x(s.now);
  if (nx >= 0 && nx <= w) {
    g.fillStyle = p.now;
    if (bar) g.fillRect(Math.round(nx) - 0.75, barY - 3, 1.5, BAR_H + 6);
    else {
      g.fillRect(Math.round(nx) - 0.5, 0, 1.5, axisTop);
      g.beginPath();
      g.moveTo(nx - 4, 0);
      g.lineTo(nx + 4, 0);
      g.lineTo(nx, 5);
      g.closePath();
      g.fill();
    }
  }

  // ---- Zeiger beim Darüberfahren, mit dem Namen der Zeile ----
  if (s.hover) {
    g.fillStyle = p.text2;
    g.globalAlpha = 0.5;
    const hy = bar ? barY : 3;
    g.fillRect(Math.round(s.hover.x), hy, 1, (bar ? barY + BAR_H : axisTop - 1) - hy);
    g.globalAlpha = 1;
    const i = s.compact ? -1 : laneTop.findIndex((y, k) => s.hover!.y >= y && s.hover!.y < y + laneH[k]! + GAP);
    const lane = i >= 0 ? lanes[i] : undefined;
    const tag = lane && laneTag(lane, s.hover.x, x);
    if (tag) {
      const tw = g.measureText(tag.label).width + 12;
      const lx = Math.min(w - tw - 2, Math.max(2, s.hover.x + 8));
      const ly = Math.min(h - 17, Math.max(1, laneTop[i]! - 1));
      g.fillStyle = p.ink0;
      g.globalAlpha = 0.92;
      g.beginPath();
      g.roundRect(lx, ly, tw, 16, 8);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = tag.color;
      g.textAlign = 'left';
      g.fillText(tag.label, lx + 6, ly + 11.5);
    }
  }

  // ---- Griff: Knopf auf der dünnen Leiste, sonst Pille mit Linie durch die Zeilen (bernstein, solange live) ----
  g.fillStyle = s.live ? p.now : p.text1;
  g.strokeStyle = p.ink0;
  g.lineWidth = 1.5;
  if (bar) {
    g.beginPath();
    g.arc(hx, barY + BAR_H / 2, 7, 0, Math.PI * 2);
    g.stroke();
    g.fill();
  } else {
    g.fillRect(Math.round(hx) - 0.75, 0, 1.5, axisTop);
    const ph = Math.min(22, axisTop - 4);
    g.beginPath();
    g.roundRect(hx - 3.5, (axisTop - ph) / 2, 7, ph, 3.5);
    g.stroke();
    g.fill();
  }

  // Kleine Bildschirme: die Anzeige des Griffs sitzt über der Leiste (am Desktop steht sie darüber)
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

/** Name und Farbe für den Zeiger über einer Spur; in gemeinsamen Spuren der Datensatz des nächsten Ereignisses. */
function laneTag(lane: Lane, hx: number, x: (t: number) => number): { label: string; color: string } | undefined {
  switch (lane.kind) {
    case 'curve': return lane.row;
    case 'bars': return lane.row;
    case 'barsum': return { label: 'Zeiträume', color: lane.rows[0]!.color };
    case 'summary':
    case 'sparse': {
      const rows = lane.kind === 'sparse' ? lane.rows : lane.sparse;
      let best: { row: DenseRow; i: number } | undefined;
      let bd = 8;
      for (const row of rows) {
        for (let i = 0; i < row.times.length; i++) {
          const d = Math.abs(x(row.times[i]!) - hx);
          if (d < bd) (bd = d, (best = { row, i }));
        }
      }
      if (best) return { label: best.row.label, color: best.row.colors?.[best.i] ?? best.row.color };
      return lane.kind === 'sparse' ? { label: 'Ereignisse', color: '#C7D0DD' } : undefined;
    }
  }
}
