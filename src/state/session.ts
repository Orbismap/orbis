// Session state: status/legend/feed of the mounted layers (and the active Karte, re-exported).
import { signal } from '@preact/signals';
import { activeKarte, activeKarteId, browsedKarte, editActive, initActive, openActive, openKarte, setActiveKarte } from '../karten/active';
import type { FeedItem, LayerStatus, LegendSpec } from '../layers/types';

// The active layers and the Karte derived from them live in karten/active.ts; re-exported here for the UI.
export { activeKarte, activeKarteId, browsedKarte, editActive, openActive, openKarte, setActiveKarte };

export const layerStatus = signal<Record<string, LayerStatus>>({});
export const legends = signal<Record<string, LegendSpec>>({});
export const feeds = signal<Record<string, FeedItem[]>>({});
/** Ereigniszeiten (ms) je Ebene für die Striche der Zeitleiste, wenn eine Ebene zu viele Ereignisse für eine Liste hat (z. B. Brände). */
export interface MarkData { times: ArrayLike<number>; /** Farbe je Ereignis (gleiche Reihenfolge wie `times`); ohne: Farbe der Ebene. */ colors?: ArrayLike<string> }
export const markTimes = signal<Record<string, MarkData>>({});


// setters read with peek(): layers call them from inside effects, which must not subscribe to what they write
export const setLayerStatus = (id: string, s: LayerStatus) => (layerStatus.value = { ...layerStatus.peek(), [id]: s });
export const setLegend = (id: string, l: LegendSpec | undefined) => {
  const { [id]: _old, ...rest } = legends.peek();
  legends.value = l ? { ...rest, [id]: l } : rest;
};
export const setFeed = (id: string, items: FeedItem[]) => (feeds.value = { ...feeds.peek(), [id]: items });
export const setMarkTimes = (id: string, data: MarkData) => (markTimes.value = { ...markTimes.peek(), [id]: data });
export function clearLayerSession(id: string): void {
  const { [id]: _s, ...s } = layerStatus.peek();
  const { [id]: _l, ...l } = legends.peek();
  const { [id]: _f, ...f } = feeds.peek();
  const { [id]: _m, ...m } = markTimes.peek();
  layerStatus.value = s;
  legends.value = l;
  feeds.value = f;
  markTimes.value = m;
}

export const initSession = initActive;
