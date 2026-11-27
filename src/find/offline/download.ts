// Estimating and downloading an offline map. The base map comes from OpenFreeMap, whose terms allow saving areas for offline
// use within limits (https://openfreemap.org/tos/): per download at most 3,000 tiles and 50 MB, at most 4 requests at a
// time, started by the person. These limits are kept here. (A web page cannot set its own User-Agent, which the terms also
// ask for; the requests name the app by their origin.)
import { pointsIn, type TilePoint } from '@/data/tilePoints';
import { KINDS, type Kind } from '../data/kinds';
import { MAX_ZOOM, tilesFor, type Shape, type TileId } from './area';
import type { OfflineStore, Region, StoredTile } from './db';
import { gzip } from './gzip';
import { FONT_PATHS, type Upstream } from './sources';
import { keepLayers } from './vtile';
import { findStyle } from '../app/mapStyle';

export const MAX_TILES = 3000;
export const MAX_DOWNLOAD_BYTES = 50_000_000;
const PARALLEL = 4;
const TRIES = 3;

/** The layers of the base map that this app draws; everything else is left out. */
export const MAP_LAYERS: ReadonlySet<string> = new Set(findStyle.layers.flatMap((l) => ('source-layer' in l && l.source === 'ofm' ? [l['source-layer']!] : [])));

export const keyOf = ({ z, x, y }: TileId) => `${z}/${x}/${y}`;

/** The usable places of `kind` among `points`, with only what the app reads from them. */
export function placesOf(kind: Kind, points: TilePoint[]): TilePoint[] {
  return points.filter((p) => kind.place(p.properties, p.lng, p.lat, p.id)).map((p) => {
    if (kind.tiles.set) return p;
    const { class: group, subclass, name } = p.properties;
    return { ...p, properties: { class: group, subclass, ...(name ? { name } : {}) } };
  });
}

const sizeOfPlaces = (list: TilePoint[]) => (list.length ? new TextEncoder().encode(JSON.stringify(list)).length : 0);

interface Built {
  tile: StoredTile;
  /** bytes as they travel (compressed), for the limit */
  transferred: number;
  stored: number;
  byKind: Record<string, number>;
}

async function build(id: TileId, kinds: readonly Kind[], source: Upstream, signal?: AbortSignal): Promise<Built> {
  const raw = await source.tile(id, signal);
  const map = raw.length ? await gzip(keepLayers(raw, MAP_LAYERS)) : raw;
  let transferred = raw.length ? (await gzip(raw)).length : 0;
  const byKind: Record<string, number> = {};
  let places: Record<string, TilePoint[]> | undefined;
  for (const kind of kinds) {
    if (id.z !== kind.tiles.zoom) continue;
    let points: TilePoint[];
    if (kind.tiles.set) {
      points = await source.setPoints(kind, id.x, id.y, signal);
    } else points = raw.length ? pointsIn(raw, kind.tiles.layer, id.z, id.x, id.y) : [];
    const kept = placesOf(kind, points);
    // an empty list is kept too: it says that there is nothing here
    (places ??= {})[kind.id] = kept;
    byKind[kind.id] = sizeOfPlaces(kept);
  }
  // places that come from a set of their own travel as well
  for (const kind of kinds) if (kind.tiles.set) transferred += byKind[kind.id] ?? 0;
  const stored = map.length + Object.values(byKind).reduce((a, b) => a + b, 0);
  return { tile: { map, places }, transferred, stored, byKind };
}

async function retry<T>(task: () => Promise<T>, signal?: AbortSignal, pause = 800): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await task();
    } catch (e) {
      if (signal?.aborted || i >= TRIES) throw e;
      await new Promise((r) => setTimeout(r, pause * i));
    }
  }
}

/** Runs `work` for every item, at most four at a time. The first failure stops the others. */
async function pool<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failure: { error: unknown } | undefined;
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (!failure && next < items.length) {
      try {
        await work(items[next++]!);
      } catch (error) {
        failure ??= { error };
      }
    }
  }));
  if (failure) throw failure.error;
}

// ---- estimate -----------------------------------------------------------------------------------------------------------

/** Tiles read to guess the size of the others. */
const SAMPLES_DETAIL = 10;
const SAMPLES_COARSE = 4;

export interface Estimate {
  tiles: number;
  /** map and letters, on the device */
  mapBytes: number;
  /** per kind, on the device; missing where its source could not be read */
  kindBytes: Record<string, number>;
  /** map and letters as they travel */
  mapTransfer: number;
}

const spread = <T>(list: T[], n: number): T[] => (list.length <= n ? list : Array.from({ length: n }, (_, i) => list[Math.floor(((i + 0.5) * list.length) / n)]!));
const FONT_BYTES = 260_000;

/** Reads a few tiles spread over the area and projects their sizes onto all of them, for every kind at once. */
export async function estimate(tiles: TileId[], source: Upstream, signal?: AbortSignal): Promise<Estimate> {
  const out: Estimate = { tiles: tiles.length, mapBytes: FONT_BYTES, mapTransfer: FONT_BYTES, kindBytes: Object.fromEntries(KINDS.map((k) => [k.id, 0])) };
  const groups: [TileId[], number][] = [
    [tiles.filter((t) => t.z === MAX_ZOOM), SAMPLES_DETAIL],
    [tiles.filter((t) => t.z !== MAX_ZOOM), SAMPLES_COARSE],
  ];
  // a kind with a source of its own must not take the whole estimate with it
  const unread = new Set<string>();
  const lenient: Upstream = {
    ...source,
    setPoints: (kind, x, y, sig) => source.setPoints(kind, x, y, sig).catch((e) => {
      if (sig?.aborted) throw e;
      unread.add(kind.id);
      return [];
    }),
  };
  for (const [group, n] of groups) {
    const chosen = spread(group, n);
    if (!chosen.length) continue;
    const factor = group.length / chosen.length;
    await pool(chosen, async (id) => {
      const built = await build(id, [], source, signal);
      const raw = id.z === MAX_ZOOM ? await build(id, KINDS, lenient, signal) : undefined;
      out.mapBytes += built.stored * factor;
      out.mapTransfer += built.transferred * factor;
      for (const [kind, size] of Object.entries(raw?.byKind ?? {})) out.kindBytes[kind]! += size * factor;
    });
  }
  for (const id of unread) delete out.kindBytes[id];
  return out;
}

export const estimatedBytes = (e: Estimate, kinds: readonly string[]) => e.mapBytes + kinds.reduce((sum, id) => sum + (e.kindBytes[id] ?? 0), 0);

// ---- download -----------------------------------------------------------------------------------------------------------

export class TooLarge extends Error {
  constructor() {
    super('Das Gebiet ist zu groß. Wähle ein kleineres und lade bei Bedarf mehrere nacheinander.');
  }
}

export interface Order { name: string; shape: Shape; kinds: string[]; /** the region that gets new data */ replaces?: Region }

let counter = 0;
const newId = (prefix: string, now: number) => `${prefix}${now.toString(36)}-${(counter++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/**
 * Downloads the whole region into a new set of tiles. Only when everything has arrived the region points to it; until then,
 * and after a failure or a stop, an old version stays as it was.
 */
export async function download(
  order: Order, store: OfflineStore, source: Upstream,
  { signal, onProgress, now = Date.now(), pause }: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void; now?: number; pause?: number } = {},
): Promise<Region> {
  const tiles = tilesFor(order.shape, MAX_TILES);
  if (!tiles) throw new TooLarge();
  const kinds = KINDS.filter((k) => order.kinds.includes(k.id));
  const data = newId('d', now);
  const total = tiles.length + FONT_PATHS.length;
  let done = 0, stored = 0, transferred = 0;
  const step = (travelled: number, kept: number) => {
    transferred += travelled;
    stored += kept;
    if (transferred > MAX_DOWNLOAD_BYTES) throw new TooLarge();
    onProgress?.(++done, total);
  };
  try {
    for (const path of FONT_PATHS) {
      signal?.throwIfAborted();
      const font = await retry(() => source.font(path, signal), signal, pause);
      await store.putFont(path, font);
      step(font.length, font.length);
    }
    await pool(tiles, async (id) => {
      signal?.throwIfAborted();
      const built = await retry(() => build(id, kinds, source, signal), signal, pause);
      signal?.throwIfAborted();
      await store.putTile(data, keyOf(id), built.tile);
      step(built.transferred, built.stored);
    });
    signal?.throwIfAborted();
    const old = order.replaces;
    const region: Region = {
      id: old?.id ?? newId('r', now), name: order.name, shape: order.shape, kinds: kinds.map((k) => k.id), data,
      tiles: tiles.length, bytes: stored, createdAt: old?.createdAt ?? now, updatedAt: now,
    };
    await store.putRegion(region);
    // the switch is done: what is left of the old set is only space, and the next start clears it if this fails
    if (old) await store.deleteTiles(old.data).catch(() => {});
    return region;
  } catch (e) {
    await store.deleteTiles(data).catch(() => {});
    throw e;
  }
}

export async function removeRegion(region: Region, store: OfflineStore): Promise<void> {
  await store.deleteRegion(region.id);
  await store.deleteTiles(region.data);
  if (!(await store.regions()).length) await store.deleteFonts();
}

/** Tiles no region points to: what a download left behind when the app was closed in the middle of it. */
export async function sweep(store: OfflineStore): Promise<void> {
  const used = new Set((await store.regions()).map((r) => r.data));
  for (const set of await store.tileSets()) if (!used.has(set)) await store.deleteTiles(set);
}
