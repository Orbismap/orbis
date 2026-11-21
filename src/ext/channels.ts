// Neutral data channels: base layers publish what an extension may present differently, extensions listen.
// The base never imports an extension; an extension only sees the narrow `TracksChannel` of ext/types.
//
// Guarantees of the base:
//  - `publish` costs one assignment while nobody listens (the list is built lazily, only for listeners).
//  - `present()` only hides the layer's own icons; data, polling, selection and cards keep working.
//  - When the last presenter releases (or the extension is disposed), the 2D presentation is back at once.
import { computed, signal, type ReadonlySignal } from '@preact/signals';
import type { BuildingSample, CardAction, FollowRef, PowerGridSample, ShipSample, TreeSample, TilesetSample, TilesetsState, TrackSample, TracksChannel } from './types';

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
  /** Calls `fn` whenever the first listener arrives (a layer that builds its list on demand publishes then). Returns the remover. */
  onListener(fn: () => void): () => void;
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
  const listenerWatchers = new Set<() => void>();

  const emit = () => {
    if (!listeners.size) return;
    const items = latest ? latest() : [];
    for (const fn of [...listeners]) fn(items);
  };

  return {
    get listening() { return listeners.size > 0; },
    get published() { return published; },
    subscribe(fn) {
      const first = listeners.size === 0;
      listeners.add(fn);
      if (latest) fn(latest());
      if (first) for (const w of [...listenerWatchers]) w();
      return () => { listeners.delete(fn); };
    },
    onListener(fn) {
      listenerWatchers.add(fn);
      return () => { listenerWatchers.delete(fn); };
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
/** The one channel for the power grid (layer `stromnetz`): towers and overhead lines. */
export const powerChannel: TracksPublisher<PowerGridSample> = createTracksChannel<PowerGridSample>();

/** The one channel for single trees (layer `baeume`). */
export const treesChannel: TracksPublisher<TreeSample> = createTracksChannel<TreeSample>();

/** The one channel for building footprints with roof tags (`features/buildings3d/roofs-source.ts`). */
export const buildingsChannel: TracksPublisher<BuildingSample> = createTracksChannel<BuildingSample>();

/** The one channel for streamed 3D city models (`features/buildings3d/tiles-source.ts`). */
export const tilesetsChannel: TracksPublisher<TilesetSample> = createTracksChannel<TilesetSample>();

/**
 * Several layers may offer tilesets (Plateau, Cesium ion): each one registers its list under its own name; the channel
 * carries them all. `build: null` withdraws the source.
 */
const tilesetSources = new Map<string, () => TilesetSample[]>();
export function setTilesetSource(name: string, build: (() => TilesetSample[]) | null): void {
  if (build) tilesetSources.set(name, build);
  else tilesetSources.delete(name);
  tilesetsChannel.publish(() => [...tilesetSources.values()].flatMap((b) => b()));
}

/** What the extension does with the tilesets (written by the extension). */
export const tilesetsState = signal<TilesetsState>({ loading: false });

/** What the URL wants followed (written by the URL sync, read by the extension). */
export const followWanted = signal<FollowRef | null>(null);
/** What the extension follows right now (written by the extension, read by the URL sync). */
export const followCurrent = signal<FollowRef | null>(null);
