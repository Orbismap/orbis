// Saved places and the route planner: stops, travel mode, the calculated route and saved routes.
import { batch, computed, effect, signal } from '@preact/signals';
import { formatCoord } from '../core/format';
import { getJSON, setJSON } from '../core/storage';
import { fetchRoutes, type RouteMode, type RouteResult } from '../features/routes/osrm';
import { parseReverse } from '../features/place/reverse';
import { mapEngine } from './ui';
import { orteView } from './hud';
import { clearSelection } from './selection';

export interface Stop { id: string; title: string; subtitle?: string; lng: number; lat: number }
export interface SavedRoute { id: string; name: string; mode: RouteMode; stops: Stop[]; distance: number; duration: number }

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
  savedRoutes.value = [{ id, name, mode: routeMode.peek(), stops: all, distance: chosen.distance, duration: chosen.duration }, ...savedRoutes.peek().filter((r) => r.id !== id)];
}
export const isRouteSaved = () => {
  const l = stops.value;
  const m = routeMode.value;
  return l.every((s) => s) && savedRoutes.value.some((r) => r.id === `${m}:${(l as Stop[]).map((s) => s.id).join('|')}`);
};

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
  });
}

/** Map click while the planner is open: fills the active field. Returns whether the click was used. */
export function routePick(at: { lng: number; lat: number }, title?: string): boolean {
  if (orteView.peek() !== 'routes') return false;
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
        mapEngine.peek()?.flyTo({ bounds: [w, s, e, n], maxZoom: 15, padding: { top: 70, bottom: 70, left: 70, right: 70 } });
      },
      (err: unknown) => {
        if ((err as Error)?.name === 'AbortError') return;
        routeState.value = { status: 'error', message: (err as Error)?.message || 'Routenberechnung fehlgeschlagen' };
      },
    );
  }, 250);
  return () => (clearTimeout(id), ctl.abort());
});
