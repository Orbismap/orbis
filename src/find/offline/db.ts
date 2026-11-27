// The offline maps in IndexedDB. They have a database of their own, so no cache of the service worker ever trims them.
import type { TilePoint } from '@/data/tilePoints';
import type { Shape } from './area';

export interface Region {
  id: string;
  name: string;
  shape: Shape;
  /** ids of the kinds whose places are kept */
  kinds: string[];
  /** which set of tiles belongs to it: an update writes a new set and switches only when it is complete */
  data: string;
  tiles: number;
  /** what it takes on the device */
  bytes: number;
  createdAt: number;
  updatedAt: number;
}

export interface StoredTile {
  /** the base map tile, gzip, only the layers the map draws; empty where there is none */
  map: Uint8Array<ArrayBuffer>;
  /** at the places' zoom: per kind what was found in this tile */
  places?: Record<string, TilePoint[]>;
}

export interface OfflineStore {
  regions(): Promise<Region[]>;
  putRegion(region: Region): Promise<void>;
  deleteRegion(id: string): Promise<void>;
  getTile(data: string, key: string): Promise<StoredTile | undefined>;
  putTile(data: string, key: string, tile: StoredTile): Promise<void>;
  deleteTiles(data: string): Promise<void>;
  /** the sets that have tiles, to find the ones an interrupted download left behind */
  tileSets(): Promise<string[]>;
  getFont(path: string): Promise<Uint8Array<ArrayBuffer> | undefined>;
  putFont(path: string, data: Uint8Array<ArrayBuffer>): Promise<void>;
  deleteFonts(): Promise<void>;
}

const NAME = 'orbis-find-offline';
let opened: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('regions', { keyPath: 'id' });
      request.result.createObjectStore('tiles');
      request.result.createObjectStore('fonts');
    };
    request.onsuccess = () => {
      // a later version of the app in another tab may upgrade
      request.result.onversionchange = () => { request.result.close(); opened = undefined; };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
  opened.catch(() => (opened = undefined));
  return opened;
}

/** Runs one request in its own transaction and answers once that is committed. */
async function run<T>(name: 'regions' | 'tiles' | 'fonts', mode: IDBTransactionMode, ask: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const request = ask(tx.objectStore(name));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? request.error);
  });
}

const setRange = (data: string) => IDBKeyRange.bound([data], [data, []]);

export const idbStore: OfflineStore = {
  regions: () => run('regions', 'readonly', (s) => s.getAll() as IDBRequest<Region[]>),
  putRegion: async (region) => { await run('regions', 'readwrite', (s) => s.put(region)); },
  deleteRegion: async (id) => { await run('regions', 'readwrite', (s) => s.delete(id)); },
  getTile: (data, key) => run('tiles', 'readonly', (s) => s.get([data, key]) as IDBRequest<StoredTile | undefined>),
  putTile: async (data, key, tile) => { await run('tiles', 'readwrite', (s) => s.put(tile, [data, key])); },
  deleteTiles: async (data) => { await run('tiles', 'readwrite', (s) => s.delete(setRange(data))); },
  tileSets: async () => [...new Set((await run('tiles', 'readonly', (s) => s.getAllKeys())).map((key) => (key as [string, string])[0]))],
  getFont: (path) => run('fonts', 'readonly', (s) => s.get(path) as IDBRequest<Uint8Array<ArrayBuffer> | undefined>),
  putFont: async (path, data) => { await run('fonts', 'readwrite', (s) => s.put(data, path)); },
  deleteFonts: async () => { await run('fonts', 'readwrite', (s) => s.clear()); },
};
