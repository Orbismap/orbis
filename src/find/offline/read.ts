// Reading from the offline maps.
import type { TilePoint } from '@/data/tilePoints';
import type { Kind } from '../data/kinds';
import type { OfflineStore, StoredTile } from './db';

/** The newest saved copy of a tile that `fits`. */
export async function savedTile(store: OfflineStore, key: string, fits: (t: StoredTile) => boolean = () => true, kind?: string): Promise<StoredTile | undefined> {
  const regions = (await store.regions()).filter((r) => !kind || r.kinds.includes(kind)).sort((a, b) => b.updatedAt - a.updatedAt);
  for (const region of regions) {
    const tile = await store.getTile(region.data, key);
    if (tile && fits(tile)) return tile;
  }
  return undefined;
}

/** The saved places of a kind in one tile; undefined where no offline map has them. */
export async function savedPoints(store: OfflineStore, kind: Kind, x: number, y: number): Promise<TilePoint[] | undefined> {
  const tile = await savedTile(store, `${kind.tiles.zoom}/${x}/${y}`, (t) => !!t.places?.[kind.id], kind.id);
  return tile?.places![kind.id];
}
