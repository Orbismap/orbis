// `orbis-season://<tile url>`: a tile of the basemap "Jahreszeiten". NASA serves its tiles with `no-store`, but the images of a past
// year never change: once fetched, a tile stays in the Cache API for good (a second visit loads nothing from the network).
import * as maplibregl from 'maplibre-gl';

const CACHE = 'orbis-season-v1';
export const SEASON_PROTOCOL = 'orbis-season';
let registered = false;

export function ensureSeasonProtocol(): void {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol(SEASON_PROTOCOL, async (params, abort) => {
    const url = params.url.slice(`${SEASON_PROTOCOL}://`.length);
    const cache = typeof caches !== 'undefined' ? await caches.open(CACHE).catch(() => null) : null;
    const hit = await cache?.match(url).catch(() => undefined);
    if (hit) return { data: await hit.arrayBuffer() };
    const res = await fetch(url, { signal: abort.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    void cache?.put(url, res.clone()).catch(() => {});
    return { data: await res.arrayBuffer() };
  });
}
