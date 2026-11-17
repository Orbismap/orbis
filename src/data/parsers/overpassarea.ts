// Overpass area loader for the OpenStreetMap layers (public transport lines, road markings): follows the map view,
// snaps the box to a grid so that panning reuses answers (cached for the session), asks the proxy first (it caches
// 15 min for all visitors) and the public servers directly as fallback. Not a parser; lives here because layer
// folders may only contain layers.
import { proxied } from '../endpoints';
import { fetchRaw } from '../http';
import { runParser } from '../worker/pool';
import type { LayerContext } from '../../layers/types';
import { liveResource, type LiveResource } from './liveresource';
import type { ParserName, ParserResult } from './index';

const ATTEMPT_MS = 10_000;
const TOTAL_MS = 22_000;
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

export interface AreaOptions<N extends ParserName> {
  parser: N;
  query(s: number, w: number, n: number, e: number): string;
  empty: ParserResult<N>;
  /** nothing is loaded below this zoom */
  minZoom: number;
  /** grid size in degrees */
  grid: number;
  /** the box reaches at most this far (degrees) from the map centre in every direction: a tilted view shows kilometres of ground */
  maxSpan?: number;
}

export function overpassArea<N extends ParserName>(ctx: LayerContext, o: AreaOptions<N>): LiveResource<ParserResult<N>> {
  const ml = ctx.map.ml;
  const cache = new Map<string, ParserResult<N>>();
  let down = 0; // index of the first endpoint worth trying (rotates when one fails)

  const res = liveResource<ParserResult<N>>({
    async load(signal): Promise<ParserResult<N>> {
      if (ml.getZoom() < o.minZoom - 0.05) return o.empty;
      const b = ml.getBounds();
      const g = o.grid;
      const c = ml.getCenter();
      const span = o.maxSpan ?? Infinity;
      const s = Math.max(-85, Math.floor(Math.max(b.getSouth(), c.lat - span) / g) * g), n = Math.min(85, Math.ceil(Math.min(b.getNorth(), c.lat + span) / g) * g);
      const w = Math.max(-180, Math.floor(Math.max(b.getWest(), c.lng - span) / g) * g), e = Math.min(180, Math.ceil(Math.min(b.getEast(), c.lng + span) / g) * g);
      const key = `${s},${w},${n},${e}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const q = encodeURIComponent(o.query(s, w, n, e));
      let last: unknown;
      const deadline = Date.now() + TOTAL_MS; // slow or dead servers end in an error status instead of an endless spinner
      for (let k = 0; k < ENDPOINTS.length * 2; k++) {
        const left = deadline - Date.now();
        if (left < 2000) break;
        const ep = ENDPOINTS[(down + (k >> 1)) % ENDPOINTS.length]!;
        const url = k % 2 === 0 ? proxied(`${ep}?data=${q}`) : `${ep}?data=${q}`;
        try {
          const r = await fetchRaw<ArrayBuffer>(url, { format: 'arraybuffer', timeout: Math.min(ATTEMPT_MS, left), signal });
          const v = (await runParser(o.parser, r.data, { format: 'json', signal })) as ParserResult<N>;
          down = (down + (k >> 1)) % ENDPOINTS.length;
          cache.set(key, v);
          if (cache.size > 24) cache.delete(cache.keys().next().value as string);
          return v;
        } catch (err) {
          if (signal.aborted) throw err;
          last = err;
        }
      }
      throw last;
    },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onMove = () => { clearTimeout(timer); timer = setTimeout(() => res.trigger(true), 600); };
  ml.on('moveend', onMove);
  const dispose = res.dispose;
  res.dispose = () => { clearTimeout(timer); ml.off('moveend', onMove); dispose(); };
  return res;
}
