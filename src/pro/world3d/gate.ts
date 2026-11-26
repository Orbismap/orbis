import { toMercator, type GeoFrame } from './frame';

// Standing objects by the thousand (trees, power towers) need new instance matrices far less often than the map draws frames: the
// matrices are relative to a fixed point and the group is only shifted (GeoInstances.update). What does depend on the view (which
// objects are in sight, which model detail they get) changes little over a few degrees or a short pan. This says when to rebuild.

/** The part of the view a build depends on. */
export interface GateView {
  lng: number;
  lat: number;
  zoom: number;
  bearing: number;
  pitch: number;
  /** size of the map in CSS pixels */
  width: number;
  height: number;
  /** projection blend of the frame (1 globe, 0 flat): the render space changes with it */
  t: number;
  /** terrain exaggeration the heights were scaled with (0 where heights do not depend on it) */
  exaggeration: number;
}

/** The view may drift this far before a rebuild. A part that culls to the view needs a margin of at least that much around it. */
export const GATE_ZOOM = 0.2;
export const GATE_BEARING = 10;
export const GATE_PITCH = 4;
/** share of the longer screen edge the map centre may move */
export const GATE_SHIFT = 0.12;
const EXAGGERATION_STEP = 0.002;

/** How far a view has moved from the one of the last build: true when that is too far. */
export function viewDrifted(from: GateView, to: GateView): boolean {
  // between globe and flat map the positions depend on the camera itself: every frame
  if (from.t !== to.t || (to.t > 0 && to.t < 1)) return true;
  if (from.width !== to.width || from.height !== to.height) return true;
  if (Math.abs(to.zoom - from.zoom) > GATE_ZOOM || Math.abs(to.pitch - from.pitch) > GATE_PITCH) return true;
  if (Math.abs(((((to.bearing - from.bearing) % 360) + 540) % 360) - 180) > GATE_BEARING) return true;
  if (Math.abs(to.exaggeration - from.exaggeration) > EXAGGERATION_STEP) return true;
  const [a, b] = [toMercator(from.lng, from.lat), toMercator(to.lng, to.lat)];
  const world = 512 * 2 ** to.zoom;
  let dx = b[0] - a[0];
  dx -= Math.round(dx);
  return Math.hypot(dx, b[1] - a[1]) * world > GATE_SHIFT * Math.max(to.width, to.height);
}

export class ViewGate {
  private built: GateView | null = null;

  /** The objects changed: rebuild with the next frame. */
  reset() {
    this.built = null;
  }

  /** Must the objects be built again for this frame? Answering yes counts as done. */
  due(frame: GeoFrame, view: Omit<GateView, 'width' | 'height' | 't'>): boolean {
    const now: GateView = { ...view, width: frame.width, height: frame.height, t: frame.t };
    if (this.built && !viewDrifted(this.built, now)) return false;
    this.built = now;
    return true;
  }
}

/** The map's camera as the gate reads it. */
export const gateCamera = (map: { getCenter(): { lng: number; lat: number }; getZoom(): number; getBearing(): number; getPitch(): number }, exaggeration = 0) => {
  const c = map.getCenter();
  return { lng: c.lng, lat: c.lat, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), exaggeration };
};
