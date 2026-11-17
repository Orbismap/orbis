// Karten: builtin + user Karten. Standard Karten are views: the user's state per Karte is a draft that is remembered
// silently; only a rebuild counts as a change (changes.ts). User Karten are edited in place and saved automatically. Persisted in localStorage, validated on load.
import { computed, effect, signal } from '@preact/signals';
import { getJSON, setJSON } from '../core/storage';
import { resolveBasemapId } from '../map/basemaps';
import { getLayer, hasLayer } from '../layers/registry';
import type { OptionValues } from '../layers/types';
import type { BasemapId } from '../map/types';
import type { IconName } from '../ui/icons/names';
import { discardModifications, isModified } from './changes';
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

interface Persisted { custom: Karte[]; drafts: Record<string, Karte> }
const validatePersisted = (raw: unknown): Persisted | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<Persisted>;
  const custom = (Array.isArray(r.custom) ? r.custom : []).map((k) => validateKarte(k)).filter((k): k is Karte => !!k && !k.builtin);
  const drafts: Record<string, Karte> = {};
  for (const [id, k] of Object.entries(r.drafts ?? {})) {
    const v = validateKarte(k);
    if (v) drafts[id] = { ...v, id };
  }
  // migration: a draft of an own Karte is its state; drafts of unknown Karten are dropped. Drafts of standard Karten
  // stay whole: what is structural counts as a change (see changes.ts), the rest is the silently remembered state.
  const std = new Set(builtinKarten().map((k) => k.id));
  const merged = custom.map((k) => (drafts[k.id] && !std.has(k.id) ? { ...drafts[k.id]!, id: k.id, builtin: undefined } : k));
  for (const id of Object.keys(drafts)) if (!std.has(id)) delete drafts[id];
  return { custom: merged, drafts };
};

const loaded = getJSON<Persisted>('karten', VERSION, validatePersisted, { custom: [], drafts: {} });
// One-time migration: layers that moved to another standard Karte are dropped from the remembered state of the old
// one (otherwise they would stay there as a foreign layer). Done once, so adding them back by hand sticks.
const MOVED: { id: string; from: string; layers: string[] }[] = [{ id: 'geld-zu-zeitzeugen', from: 'gesellschaft', layers: ['geldfluesse', 'ukraine-hilfe'] }];
for (const m of MOVED) {
  const done = getJSON<boolean>(`karten-moved-${m.id}`, 1, (r) => (r === true ? true : undefined), false);
  if (done) continue;
  const d = loaded.drafts[m.from];
  if (d) loaded.drafts[m.from] = { ...d, layers: d.layers.filter((l) => !m.layers.includes(l.id)) };
  setJSON(`karten-moved-${m.id}`, 1, true);
}
export const customKarten = signal<Karte[]>(loaded.custom);
export const drafts = signal<Record<string, Karte>>(loaded.drafts);
const builtins = computed(() => builtinKarten());

/** All Karten as the user sees them: builtins (with draft) first, then own Karten. */
// Themes always come from the code, never from a draft.
export const karten = computed<Karte[]>(() => [...builtins.value.map((k) => (drafts.value[k.id] ? { ...drafts.value[k.id]!, themes: k.themes } : k)), ...customKarten.value]);
/** The Karten the user may pick: all except hidden ones (the plain start map). */
export const listedKarten = computed<Karte[]>(() => karten.value.filter((k) => !k.hidden));
export const getKarte = (id: string): Karte | undefined => karten.value.find((k) => k.id === id);
export const isBuiltin = (id: string) => builtins.value.some((k) => k.id === id);
/** True only for a standard Karte that was really rebuilt (not for silently remembered switches). Own Karten never. */
export const isDirty = (id: string): boolean => {
  const d = drafts.value[id];
  const std = d && builtins.value.find((k) => k.id === id);
  return !!d && !!std && isModified(d, std);
};
const standardOf = (id: string) => builtins.peek().find((k) => k.id === id);

/** Persists changes; call once at start. */
export function initKartenStore(): () => void {
  return effect(() => {
    const strip = ({ themes: _t, ...k }: Karte): Karte => k;
    setJSON('karten', VERSION, { custom: customKarten.value.map(strip), drafts: Object.fromEntries(Object.entries(drafts.value).map(([id, k]) => [id, strip(k)])) } satisfies Persisted);
  });
}

/** Applies an edit: drafts for builtin Karten, in place for own Karten. */
export function editKarte(id: string, mutate: (k: Karte) => Karte): void {
  const cur = karten.peek().find((k) => k.id === id);
  if (!cur) return;
  const next = mutate(cur);
  if (builtins.peek().some((k) => k.id === id)) drafts.value = { ...drafts.peek(), [id]: next };
  else customKarten.value = customKarten.peek().map((k) => (k.id === id ? next : k));
}

/** Restores the start view of a standard Karte, including everything remembered silently. */
export function resetKarte(id: string): void {
  const { [id]: _drop, ...rest } = drafts.peek();
  drafts.value = rest;
}

/** Removes only the rebuild of a standard Karte. Returns the previous draft for undo. */
export function discardChanges(id: string): Karte | undefined {
  const d = drafts.peek()[id];
  const std = standardOf(id);
  if (!d || !std) return undefined;
  drafts.value = { ...drafts.peek(), [id]: discardModifications(d, std) };
  return d;
}
/** Puts a draft back (undo of discard/reset); undefined removes it. */
export function restoreDraft(id: string, draft: Karte | undefined): void {
  if (draft) drafts.value = { ...drafts.peek(), [id]: draft };
  else resetKarte(id);
}

/** Creates an empty own Karte and returns its id. */
export function createKarte(): string {
  const taken = new Set(karten.peek().map((k) => k.name));
  let name = 'Neue Karte';
  for (let n = 2; taken.has(name); n++) name = `Neue Karte ${n}`;
  const id = `k-${Math.random().toString(36).slice(2, 8)}`;
  customKarten.value = [...customKarten.peek(), { id, name, icon: 'pin', color: '#A58BFF', basemap: 'orbis-dark', labels: true, terminator: false, layers: [] }];
  return id;
}
/** Changes name, icon and colour of an own Karte. */
export const updateKarteMeta = (id: string, meta: { name?: string; icon?: IconName; color?: string }) =>
  !isBuiltin(id) && editKarte(id, (k) => ({ ...k, ...(meta.name?.trim() ? { name: meta.name.trim() } : {}), ...(meta.icon ? { icon: meta.icon } : {}), ...(meta.color ? { color: meta.color } : {}) }));

/** Saves the current state of a Karte as a new own Karte and returns its id. */
export function saveAs(id: string, name: string, meta: { icon?: IconName; color?: string } = {}): string | undefined {
  const src = karten.peek().find((k) => k.id === id);
  if (!src) return undefined;
  const newId = `k-${Math.random().toString(36).slice(2, 8)}`;
  customKarten.value = [...customKarten.peek(), { ...structuredClone({ ...src, themes: undefined }), id: newId, name: name.trim() || `${src.name} (Kopie)`, builtin: undefined, ...(meta.icon ? { icon: meta.icon } : {}), ...(meta.color ? { color: meta.color } : {}) }];
  return newId;
}

export function deleteKarte(id: string): void {
  if (!builtins.peek().some((k) => k.id === id)) customKarten.value = customKarten.peek().filter((k) => k.id !== id);
}
export const renameKarte = (id: string, name: string) => !isBuiltin(id) && editKarte(id, (k) => ({ ...k, name: name.trim() || k.name }));

// ---- layer edits ------------------------------------------------------------

/** Applies `fn` to one layer; a layer that is not in the Karte yet (topic rows) is added hidden first. */
const mapLayer = (k: Karte, layerId: string, fn: (l: KarteLayer) => KarteLayer): Karte => {
  const base = k.layers.some((l) => l.id === layerId) ? k.layers : [{ id: layerId, visible: false, opacity: 1 }, ...k.layers];
  return { ...k, layers: base.map((l) => (l.id === layerId ? fn(l) : l)) };
};

/** Switches a layer on/off. Switching on a field layer switches other field layers off (exclusive). */
export function setLayerVisible(karteId: string, layerId: string, visible: boolean): void {
  editKarte(karteId, (k) => {
    const exists = k.layers.some((l) => l.id === layerId);
    let layers = exists ? k.layers : visible ? [{ id: layerId, visible, opacity: 1 }, ...k.layers] : k.layers;
    layers = layers.map((l) => (l.id === layerId ? { ...l, visible } : l));
    if (visible && getLayer(layerId)?.exclusive) {
      const ex = getLayer(layerId)!.exclusive;
      layers = layers.map((l) => (l.id !== layerId && l.visible && getLayer(l.id)?.exclusive === ex ? { ...l, visible: false } : l));
    }
    return { ...k, layers };
  });
}
export const addLayer = (karteId: string, layerId: string) => setLayerVisible(karteId, layerId, true);
export const removeLayer = (karteId: string, layerId: string) => editKarte(karteId, (k) => ({ ...k, layers: k.layers.filter((l) => l.id !== layerId) }));
export const setLayerOpacity = (karteId: string, layerId: string, opacity: number) => editKarte(karteId, (k) => mapLayer(k, layerId, (l) => ({ ...l, opacity: clamp01(opacity) })));
export const setLayerOption = (karteId: string, layerId: string, option: string, value: number | string | boolean) =>
  editKarte(karteId, (k) => mapLayer(k, layerId, (l) => ({ ...l, options: { ...l.options, [option]: value } })));
/** Moves a layer to index `to` (0 = top of the stack). */
export function moveLayer(karteId: string, layerId: string, to: number): void {
  editKarte(karteId, (k) => {
    const from = k.layers.findIndex((l) => l.id === layerId);
    if (from < 0) return k;
    const layers = [...k.layers];
    const [item] = layers.splice(from, 1);
    layers.splice(Math.max(0, Math.min(layers.length, to)), 0, item!);
    return { ...k, layers };
  });
}
export const setBasemap = (karteId: string, basemap: BasemapId) => editKarte(karteId, (k) => ({ ...k, basemap }));
export const setLabels = (karteId: string, labels: boolean) => editKarte(karteId, (k) => ({ ...k, labels }));
export const setTerminator = (karteId: string, terminator: boolean) => editKarte(karteId, (k) => ({ ...k, terminator }));
