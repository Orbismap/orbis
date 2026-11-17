// "Zuletzt": layers the user switched on, map objects they opened and points they queried. Persisted, newest first.
import { effect, signal } from '@preact/signals';
import { formatCoord } from '../core/format';
import { getJSON, setJSON } from '../core/storage';
import type { Karte } from '../karten/types';
import { getLayer } from '../layers/registry';
import type { InspectCard } from '../layers/types';
import type { IconName } from '../ui/icons/names';
import { inspector, place, probe } from './selection';
import { ownOpen } from '../karten/active';
import { activeKarte } from './session';

export type HistoryKind = 'layer' | 'object' | 'place' | 'search';
export interface HistoryEntry {
  key: string;
  kind: HistoryKind;
  title: string;
  sub?: string;
  icon: IconName;
  color: string;
  at: number;
  layerId?: string;
  karteId?: string;
  /** Object card without its action buttons (functions cannot be stored). */
  card?: InspectCard;
  lng?: number;
  lat?: number;
  /** Search hit: bounds to fly to. */
  bounds?: [number, number, number, number];
  /** Search hit: OSM kind (city, village, ...). */
  placeKind?: string;
}

const KEY = 'history';
const VERSION = 1;
const MAX = 40;

const validate = (raw: unknown): HistoryEntry[] | undefined =>
  Array.isArray(raw)
    ? raw.filter((e): e is HistoryEntry => !!e && typeof e.key === 'string' && typeof e.title === 'string' && typeof e.at === 'number' && (e.kind === 'layer' || e.kind === 'object' || e.kind === 'place' || e.kind === 'search')).slice(0, MAX)
    : undefined;

export const history = signal<HistoryEntry[]>(getJSON(KEY, VERSION, validate, []));

export function record(e: Omit<HistoryEntry, 'at'>): void {
  const rest = history.peek().filter((x) => x.key !== e.key);
  history.value = [{ ...e, at: Date.now() }, ...rest].slice(0, MAX);
}
export const clearHistory = () => (history.value = []);

function recordLayer(id: string, k: Karte): void {
  const def = getLayer(id);
  if (def) record({ key: `l:${id}`, kind: 'layer', title: def.title, sub: k.name, icon: def.icon, color: def.color, layerId: id, karteId: k.id });
}

/** Watches selection, point query and layer switches. Returns a dispose function. */
export function startHistory(): () => void {
  let prev: { karte: string; vis: Set<string> } | null = null;
  const stops = [
    effect(() => {
      const s = inspector.value;
      if (!s) return;
      const { actions: _a, ...card } = s.card;
      const def = getLayer(s.layerId);
      const loc = card.location;
      record({
        key: `o:${s.layerId}:${card.title}:${loc ? `${loc[0].toFixed(3)},${loc[1].toFixed(3)}` : ''}`,
        kind: 'object',
        title: card.title,
        sub: def?.title ?? card.subtitle,
        icon: card.icon ?? def?.icon ?? 'pin',
        color: card.color ?? def?.color ?? '#72C8F0',
        layerId: s.layerId,
        card: JSON.parse(JSON.stringify(card)) as InspectCard,
        ...(loc ? { lng: loc[0], lat: loc[1] } : {}),
      });
    }),
    effect(() => {
      const p = probe.value;
      if (!p || place.peek()) return; // a searched place is recorded as such
      record({ key: `p:${p.lng.toFixed(2)},${p.lat.toFixed(2)}`, kind: 'place', title: formatCoord(p.lat, p.lng, 2), sub: 'Ort', icon: 'locate', color: '#72C8F0', lng: p.lng, lat: p.lat });
    }),
    // layers newly switched on (opening an own Karte is not a switch of its layers)
    effect(() => {
      const k = activeKarte.value;
      const vis = new Set(k.layers.filter((l) => l.visible).map((l) => l.id));
      const before = prev;
      const key = ownOpen.value?.id ?? 'auto';
      prev = { karte: key, vis };
      if (!before || before.karte !== key) return;
      for (const id of vis) if (!before.vis.has(id)) recordLayer(id, k);
    }),
    effect(() => void setJSON(KEY, VERSION, history.value)),
  ];
  return () => stops.forEach((s) => s());
}
