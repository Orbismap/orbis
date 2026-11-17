// Cursor zoom below zoom 12 (the globe) with 3D terrain on. Measured with a headless wheel probe: the point under the cursor stayed put
// down to zoom 12 and then drifted by up to 270 px by zoom 7, so the map seemed to zoom around its centre. Without terrain no drift.
//
// Cause (maplibre-gl 6.17, found by tracing the zoom frames): the projection turns to the globe below zoom 12, so the wheel zoom uses
// the globe camera helper (useGlobeControls), but the transform that helper works on still says "flat" (globeness 0). A terrain gesture
// keeps a camera state it cloned at its start (zoom 17, flat) and `prepareNextFrame` only refreshes the live transform, not that
// clone. The globe helper then anchors on the flat transform's geometry and its own blend resets the centre, frame after frame.
//
// Fix: after each `prepareNextFrame`, give the requested camera state the same transition. Relies on internals (`_camera`,
// `_requestedCameraState`, `setTransitionState`), so like buildings-tilt it is pinned to the maplibre-gl version and does nothing where
// they are not found. Upstream has no fix yet for this (a related one: maplibre-gl-js #8987).
import type { Map as MlMap } from 'maplibre-gl';

type Camera = { prepareNextFrame(transition?: number): void; _requestedCameraState?: { setTransitionState?(t: number | undefined): void } | null };

export function installGlobeTerrainFix(ml: MlMap): () => void {
  const cam = (ml as unknown as { _camera?: Camera })._camera;
  if (!cam || typeof cam.prepareNextFrame !== 'function') return () => {};
  const original = cam.prepareNextFrame;
  cam.prepareNextFrame = function (this: Camera, transition?: number) {
    original.call(this, transition);
    const requested = this._requestedCameraState;
    if (requested && typeof requested.setTransitionState === 'function') requested.setTransitionState(transition);
  };
  return () => { cam.prepareNextFrame = original; };
}
