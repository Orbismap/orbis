import { addProtocol } from 'maplibre-gl';
import { keySignal } from '../../keys/store';
import { KEYED_PROTOCOL, keyedTileUrl } from './keyed';

let registered = false;

/** Registers `orbis-tiles://<id>/z/x/y` once: fetches the provider's tile with the user's key (read at request time, never stored in the style). */
export function registerKeyedTiles() {
  if (registered) return;
  registered = true;
  addProtocol(KEYED_PROTOCOL, async (params, abortController) => {
    const [id = '', z = '', x = '', y = ''] = (params.url.split(`${KEYED_PROTOCOL}://`)[1] ?? '').split('/');
    const t = keyedTileUrl(id);
    if (!t) throw new Error(`Unbekannte Grundkarte ${id}`);
    const key = keySignal(t.key).peek();
    if (!key) throw new Error(`Für diese Grundkarte fehlt der Schlüssel (${t.key})`);
    const url = t.url.replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{key}', encodeURIComponent(key));
    const r = await fetch(url, { signal: abortController.signal });
    if (!r.ok) throw new Error(`Kachel ${id} ${z}/${x}/${y}: HTTP ${r.status}`);
    return { data: await r.arrayBuffer() };
  });
}
