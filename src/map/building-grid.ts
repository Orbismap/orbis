// "Which building stands here?" for thousands of points: the outlines of the loaded building tiles in a grid of small cells.
// The tiles of zoom 14 merge all houses of one height into a single MultiPolygon with hundreds of parts spread over the whole
// tile, so every PART goes in on its own, with its own box: a point is then tested against its few neighbours only.
import { inFootprint } from '../data/landmarks';

type Ring = [number, number][];
export interface Building { box: [number, number, number, number]; poly: Ring[]; h: number }

/** edge of a cell in degrees (about 55 m north to south) */
const CELL = 0.0005;
/** one number per grid cell (a string per cell and building would be most of the garbage of a pass) */
const cellKey = (cx: number, cy: number) => (cx + 1_000_000) * 2_000_000 + cy + 1_000_000;
const cellOf = (v: number) => Math.floor(v / CELL);

export class BuildingGrid {
  private cells = new Map<number, Building[]>();
  private seen = new Set<string>();
  /** the highest roof in the grid (m) */
  maxH = 0;

  get empty() {
    return !this.cells.size;
  }

  /** One building feature of the tiles; parts that do not touch `view` [west, south, east, north] are left out. */
  add(geometry: GeoJSON.Geometry, h: number, view: readonly [number, number, number, number]) {
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return;
    const parts = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as Ring[][];
    const [w, s, e, n] = view;
    for (const poly of parts) {
      let bw = Infinity, bs = Infinity, be = -Infinity, bn = -Infinity;
      for (const [x, y] of poly[0] ?? []) { if (x < bw) bw = x; if (x > be) be = x; if (y < bs) bs = y; if (y > bn) bn = y; }
      if (!(be >= w && bw <= e && bn >= s && bs <= n)) continue;
      // a building in the buffer of two tiles comes once per tile; the whole box in the key, so that two different cuts of one both count
      const key = `${bw.toFixed(6)},${bs.toFixed(6)},${be.toFixed(6)},${bn.toFixed(6)},${h}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      if (h > this.maxH) this.maxH = h;
      const building: Building = { box: [bw, bs, be, bn], poly, h };
      for (let x = cellOf(bw); x <= cellOf(be); x++) {
        for (let y = cellOf(bs); y <= cellOf(bn); y++) {
          const k = cellKey(x, y);
          const cell = this.cells.get(k);
          if (cell) cell.push(building);
          else this.cells.set(k, [building]);
        }
      }
    }
  }

  /** The height of the highest building whose outline holds the point and that is higher than `above` (else `above`). */
  heightAt(x: number, y: number, above = 0): number {
    let h = above;
    for (const b of this.cells.get(cellKey(cellOf(x), cellOf(y))) ?? []) {
      if (b.h > h && holds(b, x, y)) h = b.h;
    }
    return h;
  }
}

const holds = ({ box, poly }: Building, x: number, y: number) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3] && inFootprint(x, y, [poly]);
