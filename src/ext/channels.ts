// Neutral data channels: base layers publish what an extension may present differently, extensions listen.
// The base never imports an extension; an extension only sees the narrow `TracksChannel` of ext/types.
//
// Guarantees of the base:
//  - `publish` costs one assignment while nobody listens (the list is built lazily, only for listeners).
//  - `present()` only hides the layer's own icons; data, polling, selection and cards keep working.
//  - When the last presenter releases (or the extension is disposed), the 2D presentation is back at once.
import { computed, signal, type ReadonlySignal } from '@preact/signals';
import type { CardAction, ShipSample, TrackSample, TracksChannel } from './types';

/** The side of the layer: everything of `TracksChannel` plus what only the publishing layer may do. */
export interface TracksPublisher<T = TrackSample> extends TracksChannel<T> {
  /** Publishes the current list; `build` runs only if someone listens (and then once per publish). */
  publish(build: () => T[]): void;
  /** The layer is gone: listeners get an empty list, the selection is forgotten. */
  reset(): void;
  /** The id of the selected object as the layer knows it. */
  setSelectedId(id: string | null): void;
  /** How a `select(id)` of an extension opens the layer's card. Returns the function that removes the handler. */
  onSelect(handler: (id: string | null) => void): () => void;
  /** True while an extension presents the objects (the layer hides its own icons). */
  readonly presented: ReadonlySignal<boolean>;
  /** Actions for the card of `id`; `version` changes whenever they may have changed. */
  actionsFor(id: string): CardAction[];
  readonly actionsVersion: ReadonlySignal<number>;
  /** Number of publishes so far (for tests and the smoke hook). */
  readonly published: number;
}

export function createTracksChannel<T = TrackSample>(): TracksPublisher<T> {
  const listeners = new Set<(items: readonly T[]) => void>();
  let latest: (() => T[]) | null = null;
  let published = 0;
  const selected = signal<string | null>(null);
  const presenters = signal(0);
  const providers = new Set<(id: string) => CardAction[]>();
  const actionsVersion = signal(0);
  let selectHandler: ((id: string | null) => void) | null = null;

  const emit = () => {
    if (!listeners.size) return;
    const items = latest ? latest() : [];
    for (const fn of [...listeners]) fn(items);
  };

  return {
    get listening() { return listeners.size > 0; },
    get published() { return published; },
    subscribe(fn) {
      listeners.add(fn);
      if (latest) fn(latest());
      return () => { listeners.delete(fn); };
    },
    selectedId: selected,
    select(id) { selectHandler?.(id); },
    present() {
      presenters.value++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        presenters.value--;
      };
    },
    contributeActions(provider) {
      providers.add(provider);
      actionsVersion.value++;
      return {
        changed() { actionsVersion.value++; },
        dispose() { providers.delete(provider); actionsVersion.value++; },
      };
    },
    publish(build) {
      published++;
      latest = build;
      emit();
    },
    reset() {
      latest = null;
      selected.value = null;
      for (const fn of [...listeners]) fn([]);
    },
    setSelectedId(id) { if (selected.peek() !== id) selected.value = id; },
    onSelect(handler) {
      selectHandler = handler;
      return () => { if (selectHandler === handler) selectHandler = null; };
    },
    presented: computed(() => presenters.value > 0),
    actionsFor(id) {
      const out: CardAction[] = [];
      for (const p of providers) out.push(...p(id));
      return out;
    },
    actionsVersion,
  };
}

/** The one channel for aircraft (layer `flugzeuge`). */
export const tracksChannel: TracksPublisher = createTracksChannel();
/** The one channel for ships (layer `schiffe`). */
export const shipsChannel: TracksPublisher<ShipSample> = createTracksChannel<ShipSample>();
