// Ocean mask: Natural Earth 50m land and lakes (public domain) rasterised in equirectangular space.
// Pure CPU scanline fill (no canvas), so it runs in tests and workers. 1 = ocean, 0 = land or lake.
// Particles never leave the ocean with it, the field renderer clips with the same bytes as a texture.

type Ring = number[][];
type Polygon = Ring[];
interface Geom { type: string; coordinates: unknown }
export interface PolyCollection { features: { geometry: Geom | null }[] }

export interface LandMask {
  w: number;
  h: number;
  /** row-major, row 0 = 90°N, column 0 = 180°W; 255 = ocean, 0 = land/lake */
  ocean: Uint8Array;
}

const polygonsOf = (g: Geom | null): Polygon[] => {
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates as Polygon];
  if (g.type === 'MultiPolygon') return g.coordinates as Polygon[];
  return [];
};

/** Even-odd fill of one polygon (outer ring plus holes) into `buf` with `value`. */
function fillPolygon(buf: Uint8Array, w: number, h: number, poly: Polygon, value: number): void {
  const rows = new Map<number, number[]>();
  for (const ring of poly) {
    for (let i = 0, n = ring.length; i < n; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % n]!;
      const ay = ((90 - a[1]!) / 180) * h;
      const by = ((90 - b[1]!) / 180) * h;
      if (ay === by) continue;
      const ax = ((a[0]! + 180) / 360) * w;
      const bx = ((b[0]! + 180) / 360) * w;
      const [y0, y1, x0, x1] = ay < by ? [ay, by, ax, bx] : [by, ay, bx, ax];
      // pixel rows whose centre (r + 0.5) lies in [y0, y1)
      const r0 = Math.max(0, Math.ceil(y0 - 0.5));
      const r1 = Math.min(h - 1, Math.ceil(y1 - 0.5) - 1);
      for (let r = r0; r <= r1; r++) {
        const t = (r + 0.5 - y0) / (y1 - y0);
        const x = x0 + (x1 - x0) * t;
        let list = rows.get(r);
        if (!list) rows.set(r, (list = []));
        list.push(x);
      }
    }
  }
  for (const [r, xs] of rows) {
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k]! - 0.5));
      const c1 = Math.min(w - 1, Math.ceil(xs[k + 1]! - 0.5) - 1);
      if (c1 >= c0) buf.fill(value, r * w + c0, r * w + c1 + 1);
    }
  }
}

export function rasterizeMask(land: PolyCollection, lakes: PolyCollection | undefined, w = 3600, h = 1800): LandMask {
  const ocean = new Uint8Array(w * h).fill(255);
  for (const f of land.features) for (const p of polygonsOf(f.geometry)) fillPolygon(ocean, w, h, p, 0);
  // lakes are not ocean either; a lake inside a land polygon is already 0, but the Caspian Sea & co sit in holes
  for (const f of lakes?.features ?? []) for (const p of polygonsOf(f.geometry)) fillPolygon(ocean, w, h, p, 0);
  return { w, h, ocean };
}

/** True when the point is ocean. Longitude wraps, latitude clamps. */
export function isOcean(m: LandMask, lng: number, lat: number): boolean {
  let x = Math.floor(((lng + 180) / 360) * m.w);
  x = ((x % m.w) + m.w) % m.w;
  const y = Math.min(m.h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * m.h)));
  return m.ocean[y * m.w + x]! > 127;
}

/** Same lookup in mercator coordinates (x 0..1 wraps, y 0..1 north to south). */
export function isOceanMerc(m: LandMask, x: number, y: number): boolean {
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return isOcean(m, x * 360 - 180, lat);
}
