// Shared ADS-B loader (not a parser; lives here because every .ts in a category folder is a layer): circle requests to a
// readsb endpoint around the map view, merged and refreshed while somebody holds it. The detailed view is a ref-counted
// singleton per map so that `flugzeuge` and `gps-stoerungen` never request the same circles twice. Also keeps the
// latest position of every aircraft seen in detail, which beats the (older) worldwide overview when zooming out.
import { signal } from '@preact/signals';
import type { Map as MlMap } from 'maplibre-gl';
import { proxied } from '../endpoints';
import { describeError, fetchRaw } from '../http';
import type { Resource } from '../resource';
import type { TrackObject } from '../../render/tracks';
import { aircraftReadsb, coverCircles } from './readsb';

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
// the public readsb endpoints send no CORS headers: go through the proxy (VITE_ADSB_URL overrides, used as is)
export const ADSB_SOURCES = env.VITE_ADSB_URL?.trim()
  ? [env.VITE_ADSB_URL.trim()]
  : ['https://api.adsb.lol/v2/point/{lat}/{lon}/{nm}', 'https://opendata.adsb.fi/api/v3/lat/{lat}/lon/{lon}/dist/{nm}'];
const viaProxy = (tpl: string) => (env.VITE_ADSB_URL?.trim() ? tpl : proxied(tpl));

export interface CircleFeedOptions {
  ml: MlMap;
  minZoom: number;
  maxZoom?: number;
  maxCircles: number;
  pollMs: number;
  /** fixed circle centres (busy hubs) instead of covering the view: used for the worldwide fallback overview */
  hubs?: { lat: number; lng: number; nm: number }[];
  /** extra condition, e.g. "the primary source failed" */
  active?: () => boolean;
}

export function circleFeed(o: CircleFeedOptions): Resource<TrackObject[]> {
  const data = signal<TrackObject[] | undefined>(undefined);
  const state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const error = signal<string | undefined>(undefined);
  const updatedAt = signal<number | undefined>(undefined);
  const ml = o.ml;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let ctl: AbortController | undefined;
  let working = false;
  let disposed = false;
  let sourceIdx = 0;

  async function fetchCircle(c: { lat: number; lng: number; nm: number }, signal: AbortSignal): Promise<TrackObject[]> {
    let lastErr: unknown;
    for (let k = 0; k < ADSB_SOURCES.length; k++) {
      const tpl = ADSB_SOURCES[(sourceIdx + k) % ADSB_SOURCES.length]!;
      const url = viaProxy(tpl.replace('{lat}', c.lat.toFixed(3)).replace('{lon}', c.lng.toFixed(3)).replace('{nm}', String(c.nm)));
      try {
        const res = await fetchRaw<unknown>(url, { format: 'json', timeout: 30_000, signal });
        sourceIdx = (sourceIdx + k) % ADSB_SOURCES.length;
        return aircraftReadsb(res.data);
      } catch (e) {
        if (signal.aborted) throw e;
        lastErr = e;
      }
    }
    throw lastErr;
  }

  const inRange = () => {
    const z = ml.getZoom();
    return z >= o.minZoom - 0.05 && (o.maxZoom === undefined || z < o.maxZoom) && (o.active?.() ?? true);
  };

  async function load() {
    if (disposed || working || !inRange()) return;
    working = true;
    ctl?.abort();
    ctl = new AbortController();
    const sig = ctl.signal;
    try {
      const b = ml.getBounds();
      const circles = o.hubs
        ? o.hubs.filter((h) => h.lat >= b.getSouth() - 2 && h.lat <= b.getNorth() + 2 && h.lng >= b.getWest() - 2 && h.lng <= b.getEast() + 2).slice(0, o.maxCircles)
        : coverCircles([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], 250, o.maxCircles);
      if (!circles.length) throw new Error('keine Ballungsräume im Ausschnitt');
      if (state.peek() !== 'ready') state.value = 'loading';
      const parts = await Promise.all(circles.map((c) => fetchCircle(c, sig).catch((e) => { if (circles.length === 1 || sig.aborted) throw e; return null; })));
      const ok = parts.filter((p): p is TrackObject[] => p !== null);
      if (!ok.length) throw new Error('keine Antwort');
      const byId = new Map<string, TrackObject>();
      for (const p of ok) for (const t of p) byId.set(t.id, t);
      data.value = [...byId.values()];
      error.value = undefined;
      state.value = 'ready';
      updatedAt.value = Date.now();
    } catch (e) {
      if (!sig.aborted && !disposed) {
        const blocked = e instanceof Error && /Failed to fetch|NetworkError|network|nicht erreichbar/i.test(e.message);
        error.value = blocked ? 'Quelle sendet kein CORS (VITE_ADSB_URL setzen)' : describeError(e);
        state.value = data.peek() ? 'ready' : 'error';
      }
    } finally {
      working = false;
    }
  }

  const schedule = () => {
    clearTimeout(timer);
    if (disposed) return;
    timer = setTimeout(async () => {
      if (typeof document === 'undefined' || !document.hidden) await load();
      schedule();
    }, o.pollMs);
  };
  const onMove = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { void load(); }, 500);
  };
  ml.on('moveend', onMove);
  const onVisible = () => { if (!document.hidden) void load(); };
  document.addEventListener('visibilitychange', onVisible);
  void load().then(schedule);

  return {
    data, state, error, updatedAt,
    reload: () => { void load(); },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(debounce);
      ctl?.abort();
      ml.off('moveend', onMove);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}

/** Zoom from which the detailed regional view loads (a little before the layer swap at 5 so that the hand-over is seamless). */
export const DETAIL_LOAD_ZOOM = 4.2;
export const DETAIL_SHOW_ZOOM = 5;

const shared = new WeakMap<MlMap, { res: Resource<TrackObject[]>; users: number }>();

/** Ref-counted detailed view (circles of up to 250 nm around the view, every 10 s). Call the returned `release` when done. */
export function acquireDetail(ml: MlMap): { res: Resource<TrackObject[]>; release(): void } {
  let s = shared.get(ml);
  if (!s) {
    const res = circleFeed({ ml, minZoom: DETAIL_LOAD_ZOOM, maxCircles: 6, pollMs: 10_000 });
    s = { res, users: 0 };
    shared.set(ml, s);
  }
  s.users++;
  const mine = s;
  let released = false;
  return {
    res: mine.res,
    release() {
      if (released) return;
      released = true;
      if (--mine.users <= 0) {
        mine.res.dispose();
        shared.delete(ml);
      }
    },
  };
}

/** Latest detailed position per aircraft (1 h, capped) so that the overview shows the newer one. */
const LIVE_KEEP_MS = 3_600_000;
const LIVE_MAX = 30_000;
export const liveSeen = new Map<string, TrackObject>();
export function rememberLive(tracks: TrackObject[]): void {
  for (const t of tracks) liveSeen.set(t.id, t);
  if (liveSeen.size > LIVE_MAX) {
    const cutoff = Date.now() - LIVE_KEEP_MS;
    for (const [k, t] of liveSeen) if (t.t < cutoff) liveSeen.delete(k);
    while (liveSeen.size > LIVE_MAX) liveSeen.delete(liveSeen.keys().next().value as string);
  }
}

/**
 * Overview tracks with newer detailed positions swapped in (`liveSeen`), military aircraft replaced by the adsb.lol list.
 * `onlyMil`: just the military list.
 */
export function mergeOverview(base: TrackObject[] | undefined, mil: TrackObject[] | undefined, onlyMil: boolean): TrackObject[] | undefined {
  if (onlyMil) return mil ?? (base ? [] : undefined);
  if (!base && !mil) return undefined;
  const milIds = new Set(mil?.map((t) => t.id));
  const out: TrackObject[] = [];
  const seen = new Set<string>();
  for (const t of base ?? []) {
    if (milIds.has(t.id)) continue;
    const l = liveSeen.get(t.id);
    out.push(l && l.t > t.t ? l : t);
    seen.add(t.id);
  }
  for (const t of mil ?? []) out.push(t);
  return out;
}

/** Busy airspaces used for the worldwide overview when OpenSky is unreachable (circles of 200 nm). */
export const OVERVIEW_HUBS = ([
  [50, 8], [51.5, -0.5], [40.4, -3.7], [41.9, 12.5], [41, 29], [25.2, 55.4], [28.6, 77.1], [40, 116], [31.2, 121.8], [35.7, 139.7], [1.4, 103.9], [-33.9, 151.2],
  [33.6, -84.4], [40.6, -74], [41.9, -87.9], [32.9, -97], [34, -118.4], [-23.5, -46.6], [-26.1, 28.2],
] as const).map(([lat, lng]) => ({ lat, lng, nm: 200 }));
