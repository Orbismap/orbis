// The contract between the base app and an extension (e.g. Orbis Pro). This file is the ONLY thing an extension may
// import from the base, and only as types (`import type`). Everything else it needs arrives through the `ExtensionHost`.
// Keep it narrow: when the extension moves into its own repository, this file is what gets copied or published as a
// types package. No three.js here, no imports of base internals beyond types.
import type { ReadonlySignal } from '@preact/signals';
import type { CustomLayerInterface, Map as MlMap } from 'maplibre-gl';
import type { IconName } from '../ui/icons/names';

/** One tracked moving object (aircraft) as the base layer knows it. Positions are the last report, not extrapolated. */
export interface TrackSample {
  id: string;
  lng: number;
  lat: number;
  /** barometric altitude in metres, 0 on the ground */
  altM: number;
  /** degrees clockwise from north; undefined when unknown */
  track?: number;
  /** m/s over ground */
  speedMs: number;
  /** vertical rate in m/s, negative: descending */
  vrMs: number;
  ground: boolean;
  /** rotorcraft */
  heli: boolean;
  /** ADS-B emitter category (A1 … A7, B…), '' when unknown */
  category: string;
  emergency: boolean;
  military: boolean;
  /** colour of the 2D icon as '#rrggbb' (altitude, military, emergency), so both presentations agree */
  color: string;
  /** callsign (or registration), for labels; may be empty */
  label: string;
  /** time of the position fix, ms since epoch */
  t: number;
}

/** A button an extension adds to the inspector card of a selected object. */
export interface CardAction {
  id: string;
  label: string;
  icon?: IconName;
  /** shown as pressed */
  active?: boolean;
  run(): void;
}

/**
 * Channel for moving objects. A base layer publishes, an extension listens. Everything on this side is the
 * extension's view of it: it never sees the layer, only its data, its selection and what it may do with it.
 */
export interface TracksChannel {
  /** True while at least one extension listens. Publishing is free otherwise. */
  readonly listening: boolean;
  /** Calls `fn` with the latest list now (if any) and after every publish. Returns the unsubscribe function. */
  subscribe(fn: (items: readonly TrackSample[]) => void): () => void;
  /** Id of the object whose card the inspector shows, or null. */
  readonly selectedId: ReadonlySignal<string | null>;
  /** Opens the real card of the layer for this object (null: clears the selection). */
  select(id: string | null): void;
  /**
   * The extension presents the objects itself: the layer hides its own icons and labels (data and polling stay).
   * Returns the function that gives the presentation back. Calls nest; 2D is back when the last one released.
   */
  present(): () => void;
  /** Adds buttons to the card of a selected object; call `changed()` when label or state of an action changed. */
  contributeActions(provider: (id: string) => CardAction[]): { changed(): void; dispose(): void };
}

/** What the base gives an extension. */
export interface ExtensionHost {
  /** The MapLibre map (the extension adds its custom layer to it). */
  readonly map: MlMap;
  /** Adds a custom layer in the slot of the layer stack, same as base layers do. */
  addCustomLayer(layer: CustomLayerInterface, slot: 'points' | 'labels' | 'top'): void;
  removeLayer(id: string): void;
  /** 'globe' | 'mercator' */
  readonly projection: ReadonlySignal<'globe' | 'mercator'>;
  readonly tracks: TracksChannel;
  /**
   * The extension steers the camera's tilt and bearing itself (a follow camera): the base's tilt and north limits stand
   * back until the returned function is called. Called with `ease`, the camera eases once back onto the limits (and to
   * that centre elevation); called without, it only lets go and the base's own rebound brings it back.
   */
  holdCamera(): (ease?: { elevation: number }) => void;
  /** True when the user wants less motion (setting or OS). */
  reducedMotion(): boolean;
}

export interface OrbisExtension {
  readonly id: string;
  /** Starts the extension; returns the function that stops it and removes everything it added. */
  start(host: ExtensionHost): () => void;
}
