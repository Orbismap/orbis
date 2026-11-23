import { Map as MlMap } from 'maplibre-gl';
import { wxStyle } from './map-style';

const ORIGIN_ZOOM = 6;

/**
 * The one MapLibre instance of the weather app. It outlives the map card: the card only lends it a slot
 * (`attachSharedMap`) and takes it back when it unmounts, so view, tiles and layers are not rebuilt when the card
 * re-renders or the layout changes. The same element can later be moved to a full-screen host and adopted by the map
 * app (see docs/ONE-DOCUMENT-PLAN.md).
 */
let shared: { map: MlMap; element: HTMLDivElement } | null = null;

/** Put the shared map into `slot` (creating it on first use) and make it re-measure. */
export function attachSharedMap(slot: HTMLElement): MlMap {
  if (!shared) {
    const element = document.createElement('div');
    element.className = 'wx-map-canvas';
    element.setAttribute('role', 'application');
    element.setAttribute('aria-label', 'Wetterkarte');
    slot.appendChild(element);
    const map = new MlMap({
      container: element,
      style: wxStyle,
      center: [11.4, 53.7],
      zoom: ORIGIN_ZOOM,
      attributionControl: { compact: true },
      // Created with the map app's gesture options so it can be taken over as is; the weather card keeps
      // rotation and tilt off until then.
      maxPitch: 85,
      minZoom: 0.5,
      maxZoom: 19,
      dragRotate: true,
      pitchWithRotate: true,
    });
    map.dragRotate.disable();
    map.touchPitch.disable();
    map.touchZoomRotate.disableRotation();
    shared = { map, element };
    return map;
  }
  slot.appendChild(shared.element);
  shared.map.resize();
  return shared.map;
}

/** Take the map out of its slot; it keeps running (and keeps its state) until it is attached again. */
export function detachSharedMap(): void {
  shared?.element.remove();
}

/** Forget the shared map without touching it – used when the map app takes it over. */
export function releaseSharedMap(): void {
  shared = null;
}

export const peekSharedMap = (): MlMap | null => shared?.map ?? null;
