// Where the map's tiles and letters come from while there is a network.
import { PMTiles } from 'pmtiles';
import { OFM_URL } from '@/data/endpoints';
import { osmPmtilesUrl } from '@/data/osmfiles';
import { readTilePoints, type TilePoint } from '@/data/tilePoints';
import { wxStyle } from '@/wetter/features/forecast/map-style';
import type { Kind } from '../data/kinds';
import type { TileId } from './area';

const GLYPHS = wxStyle.glyphs!;
/** The letters of the map's one font: Latin with accents, and punctuation. */
export const FONT_PATHS = ['Noto Sans Regular/0-255', 'Noto Sans Regular/256-511', 'Noto Sans Regular/512-767', 'Noto Sans Regular/8192-8447'];

export interface Fetched { data: Uint8Array<ArrayBuffer>; status: number }

export interface Upstream {
  /** a base map tile; empty data where there is none */
  tile(id: TileId, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>>;
  font(path: string, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>>;
  /** the places of a kind that has a tile set of its own */
  setPoints(kind: Kind, x: number, y: number, signal?: AbortSignal): Promise<TilePoint[]>;
}

/** The address pattern of the base map's tiles; it names the current extract. */
let template: Promise<string> | undefined;
function tileTemplate(): Promise<string> {
  template ??= (async () => {
    const res = await fetch(OFM_URL, { signal: AbortSignal.timeout(15_000) });
    const found = res.ok ? ((await res.json()) as { tiles?: string[] }).tiles?.[0] : undefined;
    if (!found) throw new Error('Kartenkacheln nicht erreichbar');
    return found;
  })();
  template.catch(() => (template = undefined));
  return template;
}
/** After a failure or for a new download the address is looked up anew. */
export const forgetTemplate = () => { template = undefined; };

async function bytes(url: string, init: RequestInit): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(url, init);
  if (res.status === 404 || res.status === 204) return new Uint8Array();
  if (!res.ok) throw new Error(`Karte: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

const archives = new Map<string, PMTiles>();

const source = (cache?: RequestCache): Upstream => ({
  async tile({ z, x, y }, signal) {
    const pattern = await tileTemplate();
    return bytes(pattern.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)), { signal, cache });
  },
  font(path, signal) {
    const [stack, range] = path.split('/') as [string, string];
    return bytes(GLYPHS.replace('{fontstack}', encodeURIComponent(stack)).replace('{range}', range.replace(/\.pbf$/, '')), { signal, cache });
  },
  async setPoints({ tiles }, x, y, signal) {
    const url = await osmPmtilesUrl(tiles.set!);
    let pm = archives.get(url);
    if (!pm) archives.set(url, (pm = new PMTiles(url)));
    return readTilePoints(pm, tiles.layer, tiles.zoom, x, y, signal);
  },});

/** For the map and the estimate. */
export const upstream = source();
/** For downloads: current from the server, and past the service worker, whose cache would only hold a second copy. */
export const downloadSource = source('no-store');
