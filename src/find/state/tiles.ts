// Reading the places of a tile, from where a kind has them: an OSM tile set of its own, or the base map's tiles.
import { PMTiles } from 'pmtiles';
import { OFM_URL } from '@/data/endpoints';
import { osmPmtilesUrl } from '@/data/osmfiles';
import { pointsIn, readTilePoints, type TilePoint } from '@/data/tilePoints';
import type { Kind } from '../data/kinds';
import { idbStore } from '../offline/db';
import { savedPoints } from '../offline/read';

export type Reader = (x: number, y: number) => Promise<TilePoint[]>;

/** Decoded base map tiles kept in memory: a change of kind reads the same tiles again. */
const KEEP_TILES = 100;

let archive: { url: string; pm: PMTiles } | undefined;
async function archiveReader(set: string, layer: string, zoom: number, signal: AbortSignal): Promise<Reader> {
  const url = await osmPmtilesUrl(set);
  if (archive?.url !== url) archive = { url, pm: new PMTiles(url) };
  const { pm } = archive;
  await pm.getHeader(); // a missing file fails here, not as 81 empty tiles
  return (x, y) => readTilePoints(pm, layer, zoom, x, y, signal);
}

/** The address pattern of the base map's tiles; it names the current extract. */
let template: string | undefined;
const kept = new Map<string, TilePoint[]>();
async function baseReader(layer: string, zoom: number, signal: AbortSignal): Promise<Reader> {
  if (!template) {
    const res = await fetch(OFM_URL, { signal });
    template = res.ok ? ((await res.json()) as { tiles?: string[] }).tiles?.[0] : undefined;
    if (!template) throw new Error('Kartenkacheln nicht erreichbar');
  }
  const pattern = template;
  return async (x, y) => {
    const url = pattern.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
    const key = `${layer} ${url}`;
    const known = kept.get(key);
    if (known) return known;
    const res = await fetch(url, { signal });
    if (!res.ok && res.status !== 404) throw new Error(`Kartenkachel: ${res.status}`);
    const data = res.ok ? new Uint8Array(await res.arrayBuffer()) : new Uint8Array();
    const points = data.length ? pointsIn(data, layer, zoom, x, y) : [];
    kept.set(key, points);
    if (kept.size > KEEP_TILES) kept.delete(kept.keys().next().value!);
    return points;
  };
}

const liveReader = ({ tiles }: Kind, signal: AbortSignal): Promise<Reader> =>
  tiles.set ? archiveReader(tiles.set, tiles.layer, tiles.zoom, signal) : baseReader(tiles.layer, tiles.zoom, signal);

/** With saved places at hand the network gets this long. */
const PATIENCE_MS = 6000;

/**
 * Reads from the source, and from the offline maps where that is not possible. A search starts with the tile one stands in:
 * if neither source nor offline map has it, the search fails; further out, a tile nobody has counts as empty.
 */
export function withOffline(
  live: () => Promise<Reader>, saved: (x: number, y: number) => Promise<TilePoint[] | undefined>, isOnline: () => boolean,
  signal: AbortSignal, patience = PATIENCE_MS,
): Reader {
  let source: Promise<Reader> | undefined;
  /** the offline maps have answered once: the others around may be missing */
  let covered = false;
  const fresh = async (x: number, y: number) => (await (source ??= live()))(x, y);
  return async (x, y) => {
    const kept = await saved(x, y).catch(() => undefined);
    if (kept) {
      covered = true;
      if (!isOnline()) return kept;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<TilePoint[]>((resolve) => { timer = setTimeout(() => resolve(kept), patience); });
      return Promise.race([fresh(x, y).catch(() => kept), late]).finally(() => clearTimeout(timer));
    }
    try {
      if (!isOnline()) throw new Error('offline');
      return await fresh(x, y);
    } catch (e) {
      if (covered && !signal.aborted) return [];
      throw e;
    }
  };
}

export const tileReader = async (kind: Kind, signal: AbortSignal): Promise<Reader> =>
  withOffline(() => liveReader(kind, signal), (x, y) => savedPoints(idbStore, kind, x, y), () => navigator.onLine !== false, signal);

/** After a failure the next try looks the addresses up anew. */
export function forgetTiles(): void {
  archive = undefined;
  template = undefined;
}
