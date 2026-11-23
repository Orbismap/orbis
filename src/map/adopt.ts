import type { Map as MlMap } from 'maplibre-gl';

/** A running map offered by the weather app, to be picked up by the map view (`MapView` → `createMapEngine({ adopt })`). */
export interface AdoptedMap {
  map: MlMap;
  /** The element MapLibre renders into; it is moved into the map view's host. */
  element: HTMLElement;
}

let offered: AdoptedMap | null = null;
/** True once the app was started with an adopted map – the start splash is skipped then (the map is already there). */
export let startedWithMap = false;

export function offerMap(adopted: AdoptedMap): void {
  offered = adopted;
  startedWithMap = true;
}

export function takeAdoptedMap(): AdoptedMap | null {
  const adopted = offered;
  offered = null;
  return adopted;
}
