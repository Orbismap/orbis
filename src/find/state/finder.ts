// What the app does with the position: find the places around it, head for one of them, keep a route to it.
import { batch, computed, effect, signal, untracked } from '@preact/signals';
import { PMTiles } from 'pmtiles';
import type { LngLat } from '@/core/geo';
import { osmPmtilesUrl } from '@/data/osmfiles';
import { readTilePoints, type TilePoint } from '@/data/tilePoints';
import { fetchRoutes } from '@/features/routes/osrm';
import { OFF_ROUTE_M, guide, pickTarget, progress } from '../data/guide';
import { BIKE_PARKING, type Place } from '../data/kinds';
import { metres, searchPlaces, withOwn } from '../data/places';
import { own } from './own';
import { position } from './sensors';

export const kind = BIKE_PARKING;
/** After this many metres the surroundings are searched anew. */
const SEARCH_AGAIN_M = 300;
/** Pauses between two route requests (the routing server is a free public one). */
const ROUTE_PAUSE_MS = 3000;
const OFF_ROUTE_PAUSE_MS = 10_000;
const TIMEOUT_MS = 20_000;
/** A position this far from the last search is somewhere else: what was found there is dropped at once. */
const JUMP_M = 2000;
/** After a failed search the next position tries again only after this pause. */
const SEARCH_RETRY_MS = 10_000;

/** what the last search read from the data */
const found = signal<Place[]>([]);
export const search = signal<'waiting' | 'loading' | 'ready' | 'error'>('waiting');
/** metres around the position that the last search covered */
export const searchRadius = signal(0);
/** The place the person tapped; null: the nearest one. */
export const chosen = signal<Place | null>(null);
export const target = signal<Place | null>(null);
/** `junctions`: where the route's manoeuvres take place, without its start and end. */
export const route = signal<{ key: string; line: LngLat[]; junctions: LngLat[] } | null>(null);

const at = computed<LngLat | null>(() => (position.value ? [position.value.lng, position.value.lat] : null));
/** The places to choose from: what was found and what one has just entered oneself. */
export const places = computed(() => withOwn(kind, found.value, own.value, at.value));

/** The way from the position to the target, null while either is missing. */
export const way = computed(() => {
  const here = at.value, to = target.value;
  if (!here || !to) return null;
  return guide(here, [to.lng, to.lat], route.value?.key === to.key ? route.value.line : null);
});

// ---- search -------------------------------------------------------------------------------------------------------------

let archive: { url: string; pm: PMTiles } | undefined;
async function reader(signal: AbortSignal): Promise<(x: number, y: number) => Promise<TilePoint[]>> {
  const url = await osmPmtilesUrl(kind.set);
  if (archive?.url !== url) archive = { url, pm: new PMTiles(url) };
  const { pm } = archive;
  await pm.getHeader(); // a missing file fails here, not as 81 empty tiles
  return (x, y) => readTilePoints(pm, kind.layer, kind.zoom, x, y, signal);
}

let searchedAt: LngLat | undefined;
let searching: AbortController | undefined;
let failedAt = 0;
let lastCentre: LngLat | undefined;
async function searchAround(here: LngLat): Promise<void> {
  searching?.abort();
  const ctl = (searching = new AbortController());
  const signal = AbortSignal.any([ctl.signal, AbortSignal.timeout(TIMEOUT_MS)]);
  searchedAt = here;
  if (lastCentre && metres(lastCentre, here) > JUMP_M) {
    batch(() => {
      found.value = [];
      chosen.value = null;
      route.value = null;
    });
  }
  lastCentre = here;
  if (!found.peek().length) search.value = 'loading';
  try {
    const result = await searchPlaces(kind, here, await reader(signal));
    if (ctl.signal.aborted) return;
    batch(() => {
      found.value = result.places;
      searchRadius.value = result.radius;
      search.value = 'ready';
    });
  } catch {
    if (ctl.signal.aborted) return;
    searchedAt = undefined; // a later position tries again
    failedAt = Date.now();
    archive = undefined;
    if (!found.peek().length) search.value = 'error';
  }
}

/** Tries again after a failed search. */
export function retry(): void {
  const here = at.peek();
  if (here) void searchAround(here);
}

// ---- route --------------------------------------------------------------------------------------------------------------

let routing: AbortController | undefined;
let routedAt = 0;
let routedKey = '';
async function routeTo(here: LngLat, to: Place): Promise<void> {
  routing?.abort();
  const ctl = (routing = new AbortController());
  routedAt = Date.now();
  routedKey = to.key;
  try {
    const [best] = await fetchRoutes(kind.mode, [{ lng: here[0], lat: here[1] }, to], AbortSignal.any([ctl.signal, AbortSignal.timeout(TIMEOUT_MS)]));
    if (!ctl.signal.aborted && best) route.value = { key: to.key, line: best.coords, junctions: best.steps.slice(1, -1).map((s) => [s.lng, s.lat]) };
  } catch {
    /* without a route the arrow points straight at the target; a later position tries again */
  }
}

/** Wires the three steps to the position. Returns the cleanup. */
export function startFinder(): () => void {
  const stops = [
    // search anew once the person has moved on
    effect(() => {
      const here = at.value;
      const due = here && (searchedAt ? metres(searchedAt, here) > SEARCH_AGAIN_M : Date.now() - failedAt >= SEARCH_RETRY_MS);
      if (here && due) untracked(() => void searchAround(here));
    }),
    // head for the tapped place, else for the nearest
    effect(() => {
      const here = at.value, list = places.value, pick = chosen.value;
      target.value = pick ?? (here ? pickTarget(list, here, target.peek()) : null);
    }),
    // a route for a new target, and again after leaving it
    effect(() => {
      const here = at.value, to = target.value;
      if (!here || !to) return;
      untracked(() => {
        const current = route.peek();
        const same = current?.key === to.key;
        if (same && progress(current.line, here).off <= OFF_ROUTE_M) return;
        const pause = routedKey === to.key ? OFF_ROUTE_PAUSE_MS : ROUTE_PAUSE_MS;
        if (Date.now() - routedAt >= pause) void routeTo(here, to);
        else schedule(pause - (Date.now() - routedAt));
      });
    }),
  ];
  return () => {
    stops.forEach((stop) => stop());
    clearTimeout(timer);
    searching?.abort();
    routing?.abort();
  };
}

/** A route that had to wait is asked for once the pause is over, also while the person stands still. */
let timer: ReturnType<typeof setTimeout> | undefined;
function schedule(ms: number): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const here = at.peek(), to = target.peek();
    if (here && to && route.peek()?.key !== to.key) void routeTo(here, to);
  }, ms);
}
