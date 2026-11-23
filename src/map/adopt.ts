import type { Map as MlMap } from 'maplibre-gl';

/** A running map offered by the weather app, to be picked up by the map view (`MapView` → `createMapEngine({ adopt })`). */
export interface AdoptedMap {
  map: MlMap;
  /** The element MapLibre renders into; it is moved into the map view's host. */
  element: HTMLElement;
  /** Where "Zurück zur Wetter-App" leads: the weather page as it was before the handoff (path and query). */
  returnTo?: string;
}

let offered: AdoptedMap | null = null;
/** True once the app was started with an adopted map – the start splash is skipped then (the map is already there). */
export let startedWithMap = false;

/** Path and query of the weather app, set when the map app was started from it. */
export let returnTo: string | null = null;

export function offerMap(adopted: AdoptedMap): void {
  offered = adopted;
  returnTo = adopted.returnTo ?? '/';
  startedWithMap = true;
}

export function takeAdoptedMap(): AdoptedMap | null {
  const adopted = offered;
  offered = null;
  return adopted;
}
