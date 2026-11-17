// Buildings and building parts from Overpass (`out body geom`): footprints with the tags that decide walls and roof
// (Simple 3D Buildings, https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings). Multipolygon relations are put together
// from their member ways; every outer ring becomes one sample with the holes that lie in it.
import type { BuildingSample } from '../../ext/types';

type P = [number, number];
type Geom = { lat: number; lon: number }[];
type El = {
  type: string; id: number; tags?: Record<string, string>; geometry?: Geom;
  members?: { type: string; role?: string; geometry?: Geom }[];
};

/** The tags the 3D model reads; everything else is dropped to keep the samples small. */
const KEEP = [
  'building', 'building:part', 'height', 'building:height', 'min_height', 'building:levels', 'building:min_level', 'roof:levels',
  'roof:shape', 'roof:height', 'roof:direction', 'roof:orientation', 'roof:angle', 'roof:colour', 'roof:material',
  'building:colour', 'colour', 'building:material', 'material', 'name', 'step_count', 'step:height',
] as const;

const MAX_SAMPLES = 9000;

/** Overpass QL for the buildings and parts in a box (south, west, north, east in degrees). */
export const buildingsQuery = (s: number, w: number, n: number, e: number): string => {
  const bb = `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;
  return `[out:json][timeout:40];`
    + `(way["building"]["building"!="no"](${bb});way["building:part"]["building:part"!="no"](${bb});`
    + `relation["building"]["type"="multipolygon"](${bb});relation["building:part"]["type"="multipolygon"](${bb}););`
    + `out body geom ${MAX_SAMPLES};`;
};

const key = (p: P) => `${p[0]},${p[1]}`;
const toPts = (g: Geom): P[] => g.map((c) => [c.lon, c.lat]);

/** Joins open ways end to end into closed rings; what does not close is dropped. */
export function assembleRings(ways: P[][]): P[][] {
  const left = ways.filter((w) => w.length >= 2).map((w) => w.slice());
  const rings: P[][] = [];
  while (left.length) {
    let ring = left.shift()!;
    let grown = true;
    while (grown && key(ring[0]!) !== key(ring[ring.length - 1]!)) {
      grown = false;
      const end = key(ring[ring.length - 1]!);
      for (let i = 0; i < left.length; i++) {
        const w = left[i]!;
        if (key(w[0]!) === end) ring = ring.concat(w.slice(1));
        else if (key(w[w.length - 1]!) === end) ring = ring.concat(w.slice(0, -1).reverse());
        else continue;
        left.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (ring.length >= 4 && key(ring[0]!) === key(ring[ring.length - 1]!)) rings.push(ring);
  }
  return rings;
}

const inRing = (p: P, ring: P[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const slim = (t: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const k of KEEP) if (t[k] !== undefined) out[k] = t[k]!;
  return out;
};

export function overpassBuildings(raw: unknown): BuildingSample[] {
  const els = ((raw as { elements?: El[] } | null)?.elements ?? []) as El[];
  const out: BuildingSample[] = [];
  for (const e of els) {
    const t = e.tags ?? {};
    const part = t['building:part'] !== undefined && t.building === undefined;
    if (e.type === 'way' && e.geometry && e.geometry.length >= 4) {
      out.push({ id: `w${e.id}`, part, rings: [toPts(e.geometry)], tags: slim(t) });
    } else if (e.type === 'relation' && e.members) {
      const outers = assembleRings(e.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => toPts(m.geometry!)));
      const inners = assembleRings(e.members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry).map((m) => toPts(m.geometry!)));
      const tags = slim(t);
      outers.forEach((ring, i) => {
        const holes = inners.filter((h) => inRing(h[0]!, ring));
        out.push({ id: outers.length > 1 ? `r${e.id}.${i + 1}` : `r${e.id}`, part, rings: [ring, ...holes], tags });
      });
    }
  }
  return out.slice(0, MAX_SAMPLES);
}
