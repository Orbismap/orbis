// Session state: active Karte, status/legend/feed of the mounted layers.
import { computed, effect, signal } from '@preact/signals';
import { getJSON, setJSON } from '../core/storage';
import { DEFAULT_KARTE_ID } from '../karten/standard';
import { editKarte, karten } from '../karten/store';
import type { Karte } from '../karten/types';
import type { FeedItem, LayerStatus, LegendSpec } from '../layers/types';

export const activeKarteId = signal<string>(getJSON('active-karte', 1, (r) => (typeof r === 'string' ? r : undefined), DEFAULT_KARTE_ID));
/** The active Karte including the user's draft; falls back to the first Karte if the id is unknown. */
export const activeKarte = computed<Karte>(() => karten.value.find((k) => k.id === activeKarteId.value) ?? karten.value[0]!);

export const layerStatus = signal<Record<string, LayerStatus>>({});
export const legends = signal<Record<string, LegendSpec>>({});
export const feeds = signal<Record<string, FeedItem[]>>({});

export const setActiveKarte = (id: string) => {
  if (karten.peek().some((k) => k.id === id)) activeKarteId.value = id;
};
/** Edits the active Karte (draft for builtins). */
export const editActive = (mutate: (k: Karte) => Karte) => editKarte(activeKarte.peek().id, mutate);

// setters read with peek(): layers call them from inside effects, which must not subscribe to what they write
export const setLayerStatus = (id: string, s: LayerStatus) => (layerStatus.value = { ...layerStatus.peek(), [id]: s });
export const setLegend = (id: string, l: LegendSpec | undefined) => {
  const { [id]: _old, ...rest } = legends.peek();
  legends.value = l ? { ...rest, [id]: l } : rest;
};
export const setFeed = (id: string, items: FeedItem[]) => (feeds.value = { ...feeds.peek(), [id]: items });
export function clearLayerSession(id: string): void {
  const { [id]: _s, ...s } = layerStatus.peek();
  const { [id]: _l, ...l } = legends.peek();
  const { [id]: _f, ...f } = feeds.peek();
  layerStatus.value = s;
  legends.value = l;
  feeds.value = f;
}

export const initSession = () => effect(() => void setJSON('active-karte', 1, activeKarteId.value));
