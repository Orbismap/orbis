// Würfelt aus einer Art (species.ts) einzelne Tiere und sagt, wo jedes an einem Tag des Jahres ist.
// Reine Funktionen, deterministisch (feste Startwerte): dieselben Tiere bei jedem Aufruf, auch nach dem Neuladen.
import { DAY } from '../../core/time';
import { wrapLng } from '../../core/geo';
import type { Area, LngLat, Species } from './species';

export type Phase = 'brut' | 'herbst' | 'winter' | 'fruehjahr';
export const PHASE_LABEL: Record<Phase, string> = { brut: 'im Brut- bzw. Sommergebiet', herbst: 'auf dem Herbstzug', winter: 'im Winterquartier', fruehjahr: 'auf dem Frühjahrszug' };

/** Einen Weg als Linienzug mit Teillängen (in Grad, Längenunterschiede nach Breite gestaucht). */
interface Path { xy: Float64Array; cum: Float64Array }

export interface Bird {
  /** Index des Zugwegs in `species.flyways` */
  fw: number;
  /** Herbstweg (Brut -> Winter) und Frühjahrsweg (Winter -> Brut) */
  autumn: Path;
  spring: Path;
  /** Tage im Jahr (1 = 1. Januar): Beginn und Ende der beiden Züge */
  a0: number; a1: number; s0: number; s1: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

const KM_PER_DEG = 111.2;
/** Ein Punkt in der Fläche: Gauß-verteilt um die Mitte, höchstens bis zum Radius. */
function inArea(a: Area, r: () => number): LngLat {
  const dist = Math.min(a[2], Math.abs(gauss(r)) * a[2] * 0.55);
  const ang = r() * 2 * Math.PI;
  const cos = Math.max(0.2, Math.cos((a[1] * Math.PI) / 180));
  return [a[0] + (Math.sin(ang) * dist) / (KM_PER_DEG * cos), a[1] + (Math.cos(ang) * dist) / KM_PER_DEG];
}

function pathOf(pts: LngLat[]): Path {
  const xy = new Float64Array(pts.length * 2);
  const cum = new Float64Array(pts.length);
  pts.forEach((p, i) => {
    xy[2 * i] = p[0];
    xy[2 * i + 1] = Math.max(-85, Math.min(85, p[1]));
    if (i > 0) {
      const lat = (xy[2 * i + 1]! + xy[2 * i - 1]!) / 2;
      const dx = (xy[2 * i]! - xy[2 * i - 2]!) * Math.cos((lat * Math.PI) / 180);
      cum[i] = cum[i - 1]! + Math.hypot(dx, xy[2 * i + 1]! - xy[2 * i - 1]!);
    }
  });
  return { xy, cum };
}

/** Die Tiere einer Art; `n` überschreibt die Standardzahl. */
export function makeFlock(sp: Species, n = sp.n): Bird[] {
  const r = mulberry32(hash(sp.id));
  const total = sp.flyways.reduce((s, f) => s + f.weight, 0);
  const birds: Bird[] = [];
  for (let i = 0; i < n; i++) {
    let pick = r() * total;
    let fi = sp.flyways.length - 1;
    for (let k = 0; k < sp.flyways.length; k++) if ((pick -= sp.flyways[k]!.weight) <= 0) { fi = k; break; }
    const fw = sp.flyways[fi]!;
    const breed = inArea(fw.breed, r);
    const winter = inArea(fw.winter, r);
    // Wegpunkte: ein Versatz für das ganze Tier (der Zug bündelt sich) plus ein kleiner je Punkt
    const span = Math.hypot(winter[0] - breed[0], winter[1] - breed[1]);
    const scale = Math.max(0.5, Math.min(2.5, span / 35));
    const ox = gauss(r) * scale * 0.8;
    const oy = gauss(r) * scale * 0.8;
    const jitter = (p: LngLat): LngLat => [p[0] + ox + gauss(r) * scale * 0.4, p[1] + oy + gauss(r) * scale * 0.4];
    const via = fw.via.map(jitter);
    const back = fw.springVia ? fw.springVia.map(jitter) : [...via].reverse();
    const dAut = fw.days[0] * Math.max(0.6, 1 + gauss(r) * 0.1);
    const dSpr = fw.days[1] * Math.max(0.6, 1 + gauss(r) * 0.1);
    const a0 = sp.autumn[0] + gauss(r) * sp.autumn[1];
    const s0 = sp.spring[0] + gauss(r) * sp.spring[1];
    birds.push({ fw: fi, autumn: pathOf([breed, ...via, winter]), spring: pathOf([winter, ...back, breed]), a0, a1: a0 + dAut, s0, s1: s0 + dSpr });
  }
  return birds;
}

const smooth = (p: number) => p * p * (3 - 2 * p);
function along(path: Path, p: number, out: LngLat): void {
  const len = path.cum[path.cum.length - 1]!;
  // etwas Auf und Ab im Tempo (Rast, Rückenwind), ohne dass das Tier stehen bleibt
  const q = p + (smooth(p) - p) * 0.35;
  const at = q * len;
  let i = 1;
  while (i < path.cum.length - 1 && path.cum[i]! < at) i++;
  const c0 = path.cum[i - 1]!;
  const seg = path.cum[i]! - c0;
  const f = seg > 0 ? Math.min(1, Math.max(0, (at - c0) / seg)) : 0;
  out[0] = path.xy[2 * i - 2]! + (path.xy[2 * i]! - path.xy[2 * i - 2]!) * f;
  out[1] = path.xy[2 * i - 1]! + (path.xy[2 * i + 1]! - path.xy[2 * i - 1]!) * f;
}

/** Ort des Tiers am Tag `doy` (1 = 1. Januar, auch Bruchteile); schreibt nach `out` (Längengrad zurückgewickelt) und nennt die Phase. */
export function positionAt(b: Bird, doy: number, out: LngLat, prog?: { p: number }): Phase {
  let phase: Phase;
  if (prog) prog.p = 0;
  if (doy >= b.s0 && doy < b.s1) {
    if (prog) prog.p = (doy - b.s0) / (b.s1 - b.s0);
    along(b.spring, (doy - b.s0) / (b.s1 - b.s0), out);
    phase = 'fruehjahr';
  } else if (doy >= b.s1 && doy < b.a0) {
    out[0] = b.autumn.xy[0]!;
    out[1] = b.autumn.xy[1]!;
    phase = 'brut';
  } else if (doy >= b.a0 && doy < b.a1) {
    if (prog) prog.p = (doy - b.a0) / (b.a1 - b.a0);
    along(b.autumn, (doy - b.a0) / (b.a1 - b.a0), out);
    phase = 'herbst';
  } else if (doy + 365 >= b.a0 && doy + 365 < b.a1) {
    // ein Herbstzug, der über den Jahreswechsel reicht
    if (prog) prog.p = (doy + 365 - b.a0) / (b.a1 - b.a0);
    along(b.autumn, (doy + 365 - b.a0) / (b.a1 - b.a0), out);
    phase = 'herbst';
  } else {
    const k = b.autumn.xy.length;
    out[0] = b.autumn.xy[k - 2]!;
    out[1] = b.autumn.xy[k - 1]!;
    phase = 'winter';
  }
  out[0] = wrapLng(out[0]);
  return phase;
}

/** Tag im Jahr (UTC, 1 = 1. Januar 00:00) als Bruchteil. */
export function dayOfYear(t: number): number {
  const y = new Date(t).getUTCFullYear();
  return (t - Date.UTC(y, 0, 1)) / DAY + 1;
}

/** Anteil der Tiere, die am Tag d (Index 1..365) unterwegs sind. */
export function moveShare(birds: Bird[]): Float32Array {
  const out = new Float32Array(367);
  for (let d = 1; d <= 366; d++) {
    let n = 0;
    for (const b of birds) if ((d >= b.s0 && d < b.s1) || (d >= b.a0 && d < b.a1) || (d + 365 >= b.a0 && d + 365 < b.a1)) n++;
    out[d] = birds.length ? n / birds.length : 0;
  }
  return out;
}
