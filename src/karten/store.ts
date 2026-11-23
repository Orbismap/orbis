// Karten: builtin + own Karten. Standard Karten are a fixed catalog (see active.ts for what is on the map). Own Karten are
// edited in place and saved automatically. Persisted in localStorage, validated on load.
import { computed, effect, signal } from '@preact/signals';
import { getJSON, setJSON } from '../core/storage';
import { resolveBasemapId } from '../map/basemaps';
import { hasLayer } from '../layers/registry';
import type { OptionValues } from '../layers/types';
import type { BasemapId } from '../map/types';
import type { IconName } from '../ui/icons/names';
import { builtinKarten } from './standard';
import type { Karte, KarteLayer } from './types';

const VERSION = 1;
const clamp01 = (v: unknown, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/** Validates persisted data; unknown layer ids are dropped, invalid fields replaced by defaults. */
export function validateKarte(raw: unknown, known: (id: string) => boolean = hasLayer): Karte | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<Karte>;
  if (typeof r.id !== 'string' || !r.id || typeof r.name !== 'string') return undefined;
  const seen = new Set<string>();
  const layers: KarteLayer[] = [];
  for (const l of Array.isArray(r.layers) ? r.layers : []) {
    if (!l || typeof l.id !== 'string' || !known(l.id) || seen.has(l.id)) continue;
    seen.add(l.id);
    layers.push({
      id: l.id,
      visible: l.visible !== false,
      opacity: clamp01(l.opacity),
      ...(l.options && typeof l.options === 'object' ? { options: l.options as OptionValues } : {}),
    });
  }
  const v = r.view;
  const view = v && Array.isArray(v.center) && v.center.length === 2 && v.center.every(Number.isFinite) && Number.isFinite(v.zoom) ? { center: [v.center[0], v.center[1]] as [number, number], zoom: v.zoom } : undefined;
  return {
    id: r.id,
    name: r.name.slice(0, 60),
    icon: (typeof r.icon === 'string' ? r.icon : 'map') as IconName,
    color: typeof r.color === 'string' ? r.color : '#72C8F0',
    builtin: r.builtin === true ? true : undefined,
    basemap: (resolveBasemapId(r.basemap) ?? 'orbis-dark') as BasemapId,
    labels: r.labels !== false,
    terminator: r.terminator === true,
    layers,
    ...(r.sensitive && typeof r.sensitive.title === 'string' && typeof r.sensitive.text === 'string' ? { sensitive: { title: r.sensitive.title, text: r.sensitive.text } } : {}),
    ...(view ? { view } : {}),
  };
}

interface Persisted { custom: Karte[] }
const validatePersisted = (raw: unknown): Persisted | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<Persisted>;
  const std = new Set(builtinKarten().map((k) => k.id));
  const custom = (Array.isArray(r.custom) ? r.custom : []).map((k) => validateKarte(k)).filter((k): k is Karte => !!k && !k.builtin && !std.has(k.id));
  return { custom };
};

const loaded = getJSON<Persisted>('karten', VERSION, validatePersisted, { custom: [] });
export const customKarten = signal<Karte[]>(loaded.custom);
const builtins = computed(() => builtinKarten());

/** All Karten: the standard Karten first, then own Karten. */
export const karten = computed<Karte[]>(() => [...builtins.value, ...customKarten.value]);
/** Own order of the Karten (standard and own), set in the main menu. Ids not in it keep their default place at the end. */
export const karteOrder = signal<string[]>(getJSON('karten-order', 1, (r) => (Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : undefined), []));
/** The Karten the user may pick, in the user's order: all except hidden ones (the plain start map). */
export const listedKarten = computed<Karte[]>(() => {
  const all = karten.value.filter((k) => !k.hidden);
  const rank = (id: string) => {
    const i = karteOrder.value.indexOf(id);
    return i < 0 ? Infinity : i;
  };
  return all.map((k, i) => ({ k, i })).sort((a, b) => rank(a.k.id) - rank(b.k.id) || a.i - b.i).map((x) => x.k);
});
/** Moves a Karte to index `to` of the list. */
export function moveKarteTo(id: string, to: number): void {
  const ids = listedKarten.peek().map((k) => k.id);
  const at = ids.indexOf(id);
  if (at < 0) return;
  ids.splice(Math.max(0, Math.min(ids.length - 1, to)), 0, ids.splice(at, 1)[0]!);
  karteOrder.value = ids;
}
export const getKarte = (id: string): Karte | undefined => karten.value.find((k) => k.id === id);
export const isBuiltin = (id: string) => builtins.value.some((k) => k.id === id);

/** Persists own Karten; call once at start. */
export function initKartenStore(): () => void {
  return effect(() => void setJSON('karten', VERSION, { custom: customKarten.value } satisfies Persisted));
}

/** Applies an edit to an own Karte (standard Karten cannot be edited). */
export function editKarte(id: string, mutate: (k: Karte) => Karte): void {
  customKarten.value = customKarten.peek().map((k) => (k.id === id ? mutate(k) : k));
}

const newId = () => `k-${Math.random().toString(36).slice(2, 8)}`;

/** Creates an empty own Karte and returns its id. */
export function createKarte(): string {
  const taken = new Set(karten.peek().map((k) => k.name));
  let name = 'Neue Karte';
  for (let n = 2; taken.has(name); n++) name = `Neue Karte ${n}`;
  const id = newId();
  customKarten.value = [...customKarten.peek(), { id, name, icon: 'pin', color: '#A58BFF', basemap: 'orbis-dark', labels: true, terminator: false, layers: [] }];
  return id;
}
/** Changes name, icon and colour of an own Karte. */
export const updateKarteMeta = (id: string, meta: { name?: string; icon?: IconName; color?: string }) =>
  !isBuiltin(id) && editKarte(id, (k) => ({ ...k, ...(meta.name?.trim() ? { name: meta.name.trim() } : {}), ...(meta.icon ? { icon: meta.icon } : {}), ...(meta.color ? { color: meta.color } : {}) }));

/** Stores (or with `undefined` removes) the map position an own Karte flies to when it is opened. */
export const setKarteView = (id: string, view: Karte['view']) =>
  !isBuiltin(id) && editKarte(id, ({ view: _old, ...k }) => (view ? { ...k, view: { center: [view.center[0], view.center[1]], zoom: view.zoom } } : k));

/** Saves `src` (an own Karte, or what the scratch Karte currently shows) as a new own Karte and returns its id. */
export function saveAs(src: Karte, name: string, meta: { icon?: IconName; color?: string } = {}): string {
  const id = newId();
  const layers = src.layers.map((l) => ({ ...l }));
  customKarten.value = [...customKarten.peek(), { ...structuredClone({ ...src, themes: undefined, sensitive: undefined, layers }), id, name: name.trim() || `${src.name} (Kopie)`, builtin: undefined, hidden: undefined, ...(meta.icon ? { icon: meta.icon } : {}), ...(meta.color ? { color: meta.color } : {}) }];
  return id;
}

/** Creates an own Karte from a shared link (or opens the one that already matches) and returns its id. */
export function importKarte(v: { name: string; icon: string; color: string; basemap?: string; layers: string[] }): string {
  const ids = [...new Set(v.layers.filter(hasLayer))];
  const same = customKarten.peek().find((k) => k.name === v.name.slice(0, 60) && k.layers.map((l) => l.id).join() === ids.join());
  if (same) return same.id;
  const id = newId();
  customKarten.value = [...customKarten.peek(), { id, name: v.name.slice(0, 60), icon: v.icon as IconName, color: v.color, basemap: (resolveBasemapId(v.basemap) ?? 'orbis-dark') as BasemapId, labels: true, terminator: false, layers: ids.map((l) => ({ id: l, visible: true, opacity: 1 })) }];
  return id;
}

export function deleteKarte(id: string): void {
  if (!isBuiltin(id)) customKarten.value = customKarten.peek().filter((k) => k.id !== id);
}
export const renameKarte = (id: string, name: string) => !isBuiltin(id) && editKarte(id, (k) => ({ ...k, name: name.trim() || k.name }));
