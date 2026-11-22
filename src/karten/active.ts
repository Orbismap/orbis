// What is on the map. The truth is one ordered list of active layer ids (topmost first) plus per-layer opacity/options.
// Standard Karten are a catalog: the Karte shown for the active layers is derived (the standard Karte that holds most of
// them; layers in no standard Karte make an unsaved "scratch" Karte). Only an opened own Karte keeps its own layer list
// (edited in place); the active list then mirrors it. Basemap choices of a standard/scratch Karte last for the session.
import { batch, computed, effect, signal } from '@preact/signals';
import { getJSON, setJSON } from '../core/storage';
import { getLayer, hasLayer } from '../layers/registry';
import type { OptionValues } from '../layers/types';
import type { BasemapId } from '../map/types';
import { builtinKarten, DEFAULT_KARTE_ID, universeOf } from './standard';
import { customKarten, editKarte } from './store';
import type { Karte, KarteLayer } from './types';

export const SCRATCH_ID = 'scratch';
const clamp01 = (v: unknown, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

// ---- persisted state -----------------------------------------------------------------------------------------------

const validateIds = (raw: unknown): string[] | undefined => (Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === 'string' && hasLayer(x)))] : undefined);
interface LayerPref { opacity?: number; options?: OptionValues }
const validatePrefs = (raw: unknown): Record<string, LayerPref> | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, LayerPref> = {};
  for (const [id, p] of Object.entries(raw as Record<string, LayerPref>)) {
    if (!hasLayer(id) || !p || typeof p !== 'object') continue;
    out[id] = { ...(p.opacity !== undefined ? { opacity: clamp01(p.opacity) } : {}), ...(p.options && typeof p.options === 'object' ? { options: p.options } : {}) };
  }
  return out;
};

/** Active layer ids, topmost first. In localStorage and in the link (`l=`); nothing else about the map is stored. */
export const activeIds = signal<string[]>(getJSON('active-layers', 1, validateIds, []));
/** Opacity and options chosen per layer (not per Karte). Local only. */
export const layerPrefs = signal<Record<string, LayerPref>>(getJSON('layer-prefs', 1, validatePrefs, {}));
/** The Karte opened in the menu: a standard Karte (catalog), an own Karte (then it is also what is shown) or the scratch Karte. */
export const activeKarteId = signal<string>(
  (() => {
    const id = getJSON<string>('active-karte', 1, (r) => (typeof r === 'string' ? r : undefined), DEFAULT_KARTE_ID);
    return customKarten.peek().some((k) => k.id === id) ? id : DEFAULT_KARTE_ID;
  })(),
);
/** Basemap/labels/terminator picked for a standard or scratch Karte: this session only. */
const viewOverride = signal<{ basemap?: BasemapId; labels?: boolean; terminator?: boolean }>({});

const standard = computed(() => builtinKarten());
const startKarte = computed(() => standard.value.find((k) => k.id === DEFAULT_KARTE_ID)!);
const listed = computed(() => standard.value.filter((k) => !k.hidden));
const isOwn = (id: string) => customKarten.peek().some((k) => k.id === id);

/** The own Karte that is open, if any. */
export const ownOpen = computed(() => customKarten.value.find((k) => k.id === activeKarteId.value));

const scratchOf = (ids: string[]): Karte => ({
  id: SCRATCH_ID, name: 'Ungespeicherte Karte', icon: 'layers', color: '#A58BFF', basemap: 'orbis-dark', labels: true, terminator: false,
  layers: ids.map((id) => ({ id, visible: true, opacity: 1 })),
});

/** The Karte the active layers belong to: most layers wins (the opened one on a tie); a layer in no standard Karte makes it the scratch Karte. */
function deriveBase(ids: string[], preferred: string): Karte {
  if (!ids.length) return startKarte.value;
  const std = listed.value;
  const known = new Set(std.flatMap((k) => [...universeOf(k)]));
  if (ids.some((id) => !known.has(id))) return scratchOf(ids);
  let best: { k: Karte; n: number } | undefined;
  for (const k of [...std].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred))) {
    const u = universeOf(k);
    const n = ids.filter((id) => u.has(id)).length;
    if (n > (best?.n ?? 0)) best = { k, n };
  }
  return best?.k ?? scratchOf(ids);
}
const derived = computed(() => deriveBase(activeIds.value, activeKarteId.value));

function withState(base: Karte, ids: string[], prefs: Record<string, LayerPref>): Karte {
  const have = new Set(base.layers.map((l) => l.id));
  const on = new Set(ids);
  const extras: KarteLayer[] = ids.filter((id) => !have.has(id)).map((id) => ({ id, visible: true, opacity: 1 }));
  const layers = [...extras, ...base.layers.map((l) => ({ ...l, visible: on.has(l.id) }))].map((l) => {
    const p = prefs[l.id];
    return p ? { ...l, ...(p.opacity !== undefined ? { opacity: p.opacity } : {}), ...(p.options ? { options: { ...l.options, ...p.options } } : {}) } : l;
  });
  return { ...base, layers };
}

/** What the map shows: an opened own Karte, else the Karte derived from the active layers (with the session's basemap choice). */
export const activeKarte = computed<Karte>(() => {
  const own = ownOpen.value;
  if (own) return own;
  const k = withState(derived.value, activeIds.value, layerPrefs.value);
  const o = viewOverride.value;
  return { ...k, ...(o.basemap ? { basemap: o.basemap } : {}), ...(o.labels !== undefined ? { labels: o.labels } : {}), ...(o.terminator !== undefined ? { terminator: o.terminator } : {}) };
});

/** The Karte opened in the menu (its catalog, or the own/scratch Karte). Falls back to what is shown. */
export const browsedKarte = computed<Karte>(() => {
  const id = activeKarteId.value;
  const own = ownOpen.value;
  if (own) return own;
  if (id === SCRATCH_ID) return withState(scratchOf(activeIds.value), activeIds.value, layerPrefs.value);
  const std = standard.value.find((k) => k.id === id);
  // nothing opened yet (the plain start map): show what is on the map
  return std && !std.hidden ? withState(std, activeIds.value, layerPrefs.value) : activeKarte.value;
});

/** Active layers that belong to `k` (its own layers when it is an own/scratch Karte, else those of its topics). */
export const activeIn = (k: Karte, ids: string[] = activeIds.value): string[] => {
  if (isOwn(k.id)) return k.layers.filter((l) => l.visible).map((l) => l.id);
  if (k.id === SCRATCH_ID) return ids;
  const u = universeOf(standard.value.find((s) => s.id === k.id) ?? k);
  return ids.filter((id) => u.has(id));
};

// ---- opening Karten ------------------------------------------------------------------------------------------------

const visibleIds = (k: Karte) => k.layers.filter((l) => l.visible).map((l) => l.id);

/** Opens a Karte in the menu. An own Karte also becomes what is shown; a standard Karte only lists its layers. */
export function setActiveKarte(id: string): void {
  const known = id === SCRATCH_ID || isOwn(id) || standard.peek().some((k) => k.id === id);
  if (!known || activeKarteId.peek() === id) return;
  batch(() => {
    viewOverride.value = {};
    activeKarteId.value = id;
  });
}
/** Click on a Karte in the menu: opens it; a standard Karte with nothing active yet switches on its default layers. */
export function openKarte(id: string): void {
  batch(() => {
    setActiveKarte(id);
    const std = standard.peek().find((k) => k.id === id);
    if (std && !activeIds.peek().length) setActiveIds(std.layers.filter((l) => l.visible).map((l) => l.id));
  });
}
/** Opens what is shown (its derived Karte, the scratch Karte or the open own Karte), e.g. to show a layer's page. */
export function openActive(): void {
  setActiveKarte(activeKarte.peek().id);
}

/** Replaces the active layers (link, defaults). Leaves an own Karte. */
export function setActiveIds(ids: string[]): void {
  batch(() => {
    if (ownOpen.peek()) activeKarteId.value = DEFAULT_KARTE_ID;
    activeIds.value = [...new Set(ids.filter(hasLayer))];
  });
}

// An opened own Karte keeps its layer list; the active list follows it (for link and localStorage).
const stopMirror = effect(() => {
  const own = ownOpen.value;
  if (own) activeIds.value = visibleIds(own);
});
void stopMirror;

// ---- layer edits ---------------------------------------------------------------------------------------------------

const mapLayer = (k: Karte, layerId: string, fn: (l: KarteLayer) => KarteLayer): Karte => {
  const base = k.layers.some((l) => l.id === layerId) ? k.layers : [{ id: layerId, visible: false, opacity: 1 }, ...k.layers];
  return { ...k, layers: base.map((l) => (l.id === layerId ? fn(l) : l)) };
};

/** Switches a layer on/off. Switching on a field layer switches other field layers off (exclusive). */
export function setLayerVisible(karteId: string, layerId: string, visible: boolean): void {
  if (isOwn(karteId)) {
    editKarte(karteId, (k) => {
      const exists = k.layers.some((l) => l.id === layerId);
      let layers = exists ? k.layers : visible ? [{ id: layerId, visible, opacity: 1 }, ...k.layers] : k.layers;
      layers = layers.map((l) => (l.id === layerId ? { ...l, visible } : l));
      const ex = getLayer(layerId)?.exclusive;
      if (visible && ex) layers = layers.map((l) => (l.id !== layerId && l.visible && getLayer(l.id)?.exclusive === ex ? { ...l, visible: false } : l));
      return { ...k, layers };
    });
    return;
  }
  let ids = activeIds.peek();
  if (!visible) ids = ids.filter((x) => x !== layerId);
  else if (!ids.includes(layerId)) {
    const ex = getLayer(layerId)?.exclusive;
    ids = [layerId, ...(ex ? ids.filter((x) => getLayer(x)?.exclusive !== ex) : ids)];
  }
  activeIds.value = ids;
}
export const addLayer = (karteId: string, layerId: string) => setLayerVisible(karteId, layerId, true);
export function removeLayer(karteId: string, layerId: string): void {
  if (isOwn(karteId)) editKarte(karteId, (k) => ({ ...k, layers: k.layers.filter((l) => l.id !== layerId) }));
  else setLayerVisible(karteId, layerId, false);
}
const setPref = (layerId: string, patch: (p: LayerPref) => LayerPref) => (layerPrefs.value = { ...layerPrefs.peek(), [layerId]: patch(layerPrefs.peek()[layerId] ?? {}) });
export const setLayerOpacity = (karteId: string, layerId: string, opacity: number) =>
  isOwn(karteId) ? editKarte(karteId, (k) => mapLayer(k, layerId, (l) => ({ ...l, opacity: clamp01(opacity) }))) : setPref(layerId, (p) => ({ ...p, opacity: clamp01(opacity) }));
export const setLayerOption = (karteId: string, layerId: string, option: string, value: number | string | boolean) =>
  isOwn(karteId) ? editKarte(karteId, (k) => mapLayer(k, layerId, (l) => ({ ...l, options: { ...l.options, [option]: value } }))) : setPref(layerId, (p) => ({ ...p, options: { ...p.options, [option]: value } }));

/** Moves a layer to index `to` of the Karte's layer list (0 = top of the stack). */
export function moveLayer(karteId: string, layerId: string, to: number): void {
  if (isOwn(karteId)) {
    editKarte(karteId, (k) => {
      const from = k.layers.findIndex((l) => l.id === layerId);
      if (from < 0) return k;
      const layers = [...k.layers];
      const [item] = layers.splice(from, 1);
      layers.splice(Math.max(0, Math.min(layers.length, to)), 0, item!);
      return { ...k, layers };
    });
    return;
  }
  const target = browsedKarte.peek().layers[to]?.id;
  const ids = activeIds.peek();
  if (!target || target === layerId || !ids.includes(layerId) || !ids.includes(target)) return;
  const next = ids.filter((x) => x !== layerId);
  next.splice(next.indexOf(target) + (ids.indexOf(layerId) < ids.indexOf(target) ? 1 : 0), 0, layerId);
  activeIds.value = next;
}

/** Own Karten keep their basemap; for every other Karte the choice lasts for the session only. */
export function setBasemap(karteId: string, basemap: BasemapId): void {
  if (isOwn(karteId)) editKarte(karteId, (k) => ({ ...k, basemap }));
  else viewOverride.value = { ...viewOverride.peek(), basemap };
}
/** Drops a session basemap choice again, so the Karte's own default applies (e.g. for a link carrying that default). */
export function clearBasemap(): void {
  if (viewOverride.peek().basemap === undefined) return;
  const { basemap: _basemap, ...rest } = viewOverride.peek();
  viewOverride.value = rest;
}
export function setLabels(karteId: string, labels: boolean): void {
  if (isOwn(karteId)) editKarte(karteId, (k) => ({ ...k, labels }));
  else viewOverride.value = { ...viewOverride.peek(), labels };
}
export function setTerminator(karteId: string, terminator: boolean): void {
  if (isOwn(karteId)) editKarte(karteId, (k) => ({ ...k, terminator }));
  else viewOverride.value = { ...viewOverride.peek(), terminator };
}
/** Edits the active Karte in place (own Karten only; others have no state of their own). */
export const editActive = (mutate: (k: Karte) => Karte) => {
  const own = ownOpen.peek();
  if (own) editKarte(own.id, mutate);
};

/** Persists the active layers, their per-layer settings and the opened own Karte; call once at start. */
export function initActive(): () => void {
  const stops = [
    effect(() => void setJSON('active-layers', 1, activeIds.value)),
    effect(() => void setJSON('layer-prefs', 1, layerPrefs.value)),
    effect(() => void setJSON('active-karte', 1, ownOpen.value ? activeKarteId.value : DEFAULT_KARTE_ID)),
  ];
  return () => stops.forEach((s) => s());
}
