// The map's tiles and letters go through the app (`findmap://…`), so that it can answer them from the offline maps. With a
// network they come from the source, which is current; without one, or when it fails or hangs, the saved copy answers.
import type { RequestParameters } from 'maplibre-gl';
import { idbStore, type OfflineStore } from './db';
import { gunzip } from './gzip';
import { savedTile } from './read';
import { forgetTemplate, upstream, type Upstream } from './sources';

export const SCHEME = 'findmap';
/** With a saved copy at hand the network gets this long. */
const PATIENCE_MS = 4000;

type Saved = () => Promise<Uint8Array<ArrayBuffer> | undefined>;

export async function answer(fresh: (signal: AbortSignal) => Promise<Uint8Array<ArrayBuffer>>, saved: Saved, abort: AbortSignal, isOnline: boolean, patience = PATIENCE_MS): Promise<Uint8Array<ArrayBuffer>> {
  // a broken or blocked database must not take the map away while there is a network
  const kept = await saved().catch(() => undefined);
  if (kept && !isOnline) return kept;
  try {
    if (!kept) return await fresh(abort);
    const signal = AbortSignal.any([abort, AbortSignal.timeout(patience)]);
    // not every step of the way listens to the signal (looking up the address does not), so the wait ends here too
    const late = new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    return await Promise.race([fresh(signal), late]);
  } catch (e) {
    if (kept && !abort.aborted) return kept;
    forgetTemplate();
    throw e;
  }
}

export function mapRequest(url: string, abort: AbortSignal, store: OfflineStore = idbStore, source: Upstream = upstream, isOnline = navigator.onLine): Promise<Uint8Array<ArrayBuffer>> {
  const [type, ...rest] = url.slice(`${SCHEME}://`.length).split('/');
  if (type === 'tile') {
    const [z, x, y] = rest.map(Number) as [number, number, number];
    return answer(
      (signal) => source.tile({ z, x, y }, signal),
      async () => {
        const tile = await savedTile(store, `${z}/${x}/${y}`);
        return tile && (tile.map.length ? gunzip(tile.map) : tile.map);
      },
      abort, isOnline,
    );
  }
  const path = decodeURIComponent(rest.join('/'));
  return answer((signal) => source.font(path, signal), () => store.getFont(path), abort, isOnline);
}

export const loadForMap = async (request: RequestParameters, abort: AbortController) => {
  const data = await mapRequest(request.url, abort.signal);
  return { data: data.buffer };
};
