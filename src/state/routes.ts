// Saved places and the route planner: stops, travel mode, the calculated route and saved routes.
import { batch, computed, effect, signal } from '@preact/signals';
import { formatCoord } from '../core/format';
import { getJSON, setJSON } from '../core/storage';
import { fetchAscentDescent, fetchRoutes, thinCoords, type RouteMode, type RouteResult } from '../features/routes/osrm';
import { parseReverse } from '../features/place/reverse';
import { mapEngine } from './ui';
import { orteView } from './hud';
import { clearSelection } from './selection';

export interface Stop { id: string; title: string; subtitle?: string; lng: number; lat: number }
/** `coords`: light copy of the line for the preview; `ascent`/`descent` in metres, once the elevation lookup has answered. */
export interface SavedRoute { id: string; name: string; mode: RouteMode; stops: Stop[]; distance: number; duration: number; coords?: [number, number][]; ascent?: number; descent?: number; note?: string }

export const stopId = (lng: number, lat: number) => `${lng.toFixed(5)},${lat.toFixed(5)}`;
export const coordStop = (lng: number, lat: number): Stop => ({ id: stopId(lng, lat), title: formatCoord(lat, lng, 4), lng, lat });

const isStop = (s: unknown): s is Stop => !!s && typeof s === 'object' && typeof (s as Stop).id === 'string' && typeof (s as Stop).title === 'string' && Number.isFinite((s as Stop).lng) && Number.isFinite((s as Stop).lat);
const list = <T>(ok: (x: unknown) => x is T) => (raw: unknown): T[] | undefined => (Array.isArray(raw) ? raw.filter(ok) : undefined);

// ---- saved places ----
export const savedPlaces = signal<Stop[]>(getJSON('saved-places', 1, list(isStop), []));
effect(() => void setJSON('saved-places', 1, savedPlaces.value));
export const isPlaceSaved = (lng: number, lat: number) => savedPlaces.value.some((p) => p.id === stopId(lng, lat));
export function toggleSavedPlace(p: Omit<Stop, 'id'>): boolean {
  const id = stopId(p.lng, p.lat);
  const has = savedPlaces.peek().some((x) => x.id === id);
  savedPlaces.value = has ? savedPlaces.peek().filter((x) => x.id !== id) : [{ ...p, id }, ...savedPlaces.peek()];
  return !has;
}

// ---- saved routes ----
const isSavedRoute = (r: unknown): r is SavedRoute => !!r && typeof r === 'object' && typeof (r as SavedRoute).id === 'string' && Array.isArray((r as SavedRoute).stops) && (r as SavedRoute).stops.every(isStop) && ['car', 'bike', 'foot'].includes((r as SavedRoute).mode);
export const savedRoutes = signal<SavedRoute[]>(getJSON('saved-routes', 1, list(isSavedRoute), []));
effect(() => void setJSON('saved-routes', 1, savedRoutes.value));

// ---- planner ----
export const routeMode = signal<RouteMode>(getJSON('route-mode', 1, (v): RouteMode | undefined => (v === 'car' || v === 'bike' || v === 'foot' ? v : undefined), 'car'));
effect(() => void setJSON('route-mode', 1, routeMode.value));
/** Start, optional stops, destination. `null` = field still empty. */
export const stops = signal<(Stop | null)[]>([null, null]);
/** Route menu: saved routes ('list') or the planner ('plan'). Map clicks only set route points while planning. */
export const routeView = signal<'list' | 'plan'>('list');
/** The field a click on the map fills. */
export const activeStop = signal(0);
export type RouteState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; routes: RouteResult[] };
export const routeState = signal<RouteState>({ status: 'idle' });
/** Index of the chosen route among the alternatives. */
export const routeChoice = signal(0);

const firstEmpty = () => stops.peek().findIndex((s) => s === null);

export function setStop(i: number, s: Stop | null): void {
  batch(() => {
    stops.value = stops.peek().map((x, j) => (j === i ? s : x));
    const e = firstEmpty();
    if (s && e >= 0) activeStop.value = e;
  });
}
export function addStop(): void {
  const l = stops.peek();
  if (l.length >= 6) return;
  stops.value = [...l.slice(0, -1), null, l[l.length - 1]!];
  activeStop.value = l.length - 1;
}
export function removeStop(i: number): void {
  const l = stops.peek();
  if (l.length <= 2) return setStop(i, null);
  stops.value = l.filter((_, j) => j !== i);
  activeStop.value = Math.min(activeStop.peek(), stops.peek().length - 1);
}
export function swapStops(): void {
  stops.value = [...stops.peek()].reverse();
}
export function clearRoute(): void {
  batch(() => {
    stops.value = [null, null];
    activeStop.value = 0;
  });
}
export function loadRoute(r: SavedRoute): void {
  batch(() => {
    routeMode.value = r.mode;
    stops.value = r.stops;
    activeStop.value = r.stops.length;
  });
}
export function saveCurrentRoute(): void {
  const st = routeState.peek();
  const l = stops.peek();
  if (st.status !== 'ok' || l.some((s) => s === null)) return;
  const all = l as Stop[];
  const chosen = st.routes[routeChoice.peek()] ?? st.routes[0]!;
  const name = `${all[0]!.title.split(',')[0]} → ${all[all.length - 1]!.title.split(',')[0]}`;
  const id = `${routeMode.peek()}:${all.map((s) => s.id).join('|')}`;
  const coords = thinCoords(chosen.coords, 80);
  savedRoutes.value = [{ id, name, mode: routeMode.peek(), stops: all, distance: chosen.distance, duration: chosen.duration, coords }, ...savedRoutes.peek().filter((r) => r.id !== id)];
  void fillElevation(id, coords);
}
const patchSaved = (id: string, patch: Partial<SavedRoute>) => (savedRoutes.value = savedRoutes.peek().map((r) => (r.id === id ? { ...r, ...patch } : r)));
/** Looks up climb and descent of a saved route (once, in the background; no values when the service is down). */
export async function fillElevation(id: string, coords: [number, number][]): Promise<void> {
  try {
    patchSaved(id, await fetchAscentDescent(coords));
  } catch {
    /* the card simply shows no elevation */
  }
}
const backfilled = new Set<string>();
/** Saved routes from before previews existed: fetch the line again (and the elevation), once per session. */
export async function backfillRoute(r: SavedRoute): Promise<void> {
  if (backfilled.has(r.id) || (r.coords && r.ascent !== undefined)) return;
  backfilled.add(r.id);
  let coords = r.coords;
  if (!coords) {
    try {
      const best = (await fetchRoutes(r.mode, r.stops, new AbortController().signal))[0];
      if (!best) return;
      coords = thinCoords(best.coords, 80);
      patchSaved(r.id, { coords });
    } catch {
      return;
    }
  }
  await fillElevation(r.id, coords);
}

/** Own name (kept when empty) and note of a saved route. */
export const editSavedRoute = (id: string, v: { name: string; note: string }) => patchSaved(id, { ...(v.name.trim() ? { name: v.name.trim().slice(0, 60) } : {}), note: v.note.trim().slice(0, 300) || undefined });
export const deleteSavedRoute = (id: string) => (savedRoutes.value = savedRoutes.peek().filter((r) => r.id !== id));
export const isRouteSaved = () => {
  const l = stops.value;
  const m = routeMode.value;
  return l.every((s) => s) && savedRoutes.value.some((r) => r.id === `${m}:${(l as Stop[]).map((s) => s.id).join('|')}`);
};

/** Opens the planner with nothing filled in (menu, Cmd+K). */
export function newRoute(): void {
  clearSelection();
  batch(() => {
    clearRoute();
    orteView.value = 'routes';
    routeView.value = 'plan';
  });
}

/** Opens the planner with a destination (from a place card). */
export function routeTo(p: Omit<Stop, 'id'>): void {
  clearSelection();
  const to: Stop = { ...p, id: stopId(p.lng, p.lat) };
  batch(() => {
    const l = stops.peek();
    stops.value = [l.length > 2 ? l[0]! : l[0] && l[0].id !== to.id ? l[0] : null, ...l.slice(1, -1), to];
    activeStop.value = Math.max(0, stops.peek().findIndex((s) => s === null));
    if (stops.peek().every((s) => s)) activeStop.value = 0;
    orteView.value = 'routes';
    routeView.value = 'plan';
  });
}

/** Map click while the planner is open: fills the active field. Returns whether the click was used. */
export function routePick(at: { lng: number; lat: number }, title?: string): boolean {
  if (orteView.peek() !== 'routes' || routeView.peek() !== 'plan') return false;
  const l = stops.peek();
  // start and destination set: a click adds a point to the route (before the destination)
  if (l.length < 6 && l.every((x) => x)) addStop();
  const i = Math.min(activeStop.peek(), stops.peek().length - 1);
  const s = coordStop(at.lng, at.lat);
  if (title) return setStop(i, { ...s, title }), true;
  setStop(i, s);
  fetch(`https://photon.komoot.io/reverse?lon=${at.lng}&lat=${at.lat}&lang=de&limit=1`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { features?: { properties: Parameters<typeof parseReverse>[0] }[] } | null) => {
      const f = j?.features?.[0];
      const title = f ? parseReverse(f.properties).title : undefined;
      if (title && stops.peek()[i]?.id === s.id) setStop(i, { ...s, title });
    })
    .catch(() => {});
  return true;
}

// ---- calculation: whenever two or more stops are set (debounced), the route is fetched again ----
// keyed by mode and stop ids, so a title change (reverse lookup) does not restart the request
const routeKey = computed(() => {
  const l = stops.value;
  return l.every((s) => s) ? `${routeMode.value}:${l.map((s) => s!.id).join('|')}` : '';
});
effect(() => {
  if (!routeKey.value) {
    routeState.value = { status: 'idle' };
    return;
  }
  const mode = routeMode.peek();
  const pts = stops.peek() as Stop[];
  routeState.value = { status: 'loading' };
  // while the route is calculated: frame the stops, so that start and destination are in view (the route itself is framed on arrival)
  let w = 180, so = 90, e = -180, n = -90;
  for (const p of pts) (w = Math.min(w, p.lng), e = Math.max(e, p.lng), so = Math.min(so, p.lat), n = Math.max(n, p.lat));
  mapEngine.peek()?.flyTo({ bounds: [w, so, e, n], maxZoom: 15, duration: 1800, easing: 'linear', padding: { top: 70, bottom: 70, left: 70, right: 70 } });
  const ctl = new AbortController();
  const id = setTimeout(() => {
    fetchRoutes(mode, pts, ctl.signal).then(
      (routes) => {
        batch(() => {
          routeChoice.value = 0;
          routeState.value = { status: 'ok', routes };
        });
        let w = 180, s = 90, e = -180, n = -90;
        for (const [x, y] of routes.flatMap((r) => r.coords)) (w = Math.min(w, x), e = Math.max(e, x), s = Math.min(s, y), n = Math.max(n, y));
        // still on its way to the stops: carry on without stopping, only slowing down at the end
        const moving = mapEngine.peek()?.ml.isMoving() ?? false;
        mapEngine.peek()?.flyTo({ bounds: [w, s, e, n], maxZoom: 15, padding: { top: 70, bottom: 70, left: 70, right: 70 }, ...(moving ? { easing: 'out' as const, duration: 1000 } : {}) });
      },
      (err: unknown) => {
        if ((err as Error)?.name === 'AbortError') return;
        routeState.value = { status: 'error', message: (err as Error)?.message || 'Routenberechnung fehlgeschlagen' };
      },
    );
  }, 250);
  return () => (clearTimeout(id), ctl.abort());
});
