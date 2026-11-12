// Per-frame camera feed for HUD elements (scale bar, tilt slider, compass). The camera signal in state/view is throttled
// (~10 Hz) on purpose (URL sync, layers); anything that has to move smoothly with the map reads from here instead.
// Nothing runs while the map is idle: only MapLibre's own events (move/render) and pokeCameraFrame() wake it up.
import type { Map as MlMap } from 'maplibre-gl';

export interface CameraFrame { zoom: number; bearing: number; pitch: number; center: { lng: number; lat: number } }

/** `next` shifted by multiples of 360 so it lies within 180 of `prev` (a continuous angle: no backwards spin at ±180). */
export function unwrapAngle(prev: number, next: number): number {
  return next + 360 * Math.round((prev - next) / 360);
}

interface Bus { subs: Set<(f: CameraFrame) => void>; last?: CameraFrame; raf: number; emit(): void }
const buses = new WeakMap<MlMap, Bus>();

function busFor(ml: MlMap): Bus {
  let bus = buses.get(ml);
  if (bus) return bus;
  const b: Bus = {
    subs: new Set(),
    raf: 0,
    emit() {
      if (!b.subs.size) return;
      const c = ml.getCenter();
      const f: CameraFrame = { zoom: ml.getZoom(), bearing: ml.getBearing(), pitch: ml.getPitch(), center: { lng: c.lng, lat: c.lat } };
      const l = b.last;
      if (l && l.zoom === f.zoom && l.bearing === f.bearing && l.pitch === f.pitch && l.center.lng === f.center.lng && l.center.lat === f.center.lat) return;
      b.last = f;
      for (const cb of [...b.subs]) cb(f);
    },
  };
  const schedule = () => {
    if (b.raf) return;
    b.raf = requestAnimationFrame(() => ((b.raf = 0), b.emit()));
  };
  // 'render' fires once per drawn frame (synchronously emit: no extra frame of delay); 'move' and pokes are coalesced to one rAF.
  ml.on('render', () => b.emit());
  ml.on('move', schedule);
  (b as Bus & { schedule: () => void }).schedule = schedule;
  buses.set(ml, b);
  return b;
}

/** Calls `cb` at most once per animation frame while the camera changes; also once right away with the current camera. Returns the unsubscribe. */
export function onCameraFrame(ml: MlMap, cb: (f: CameraFrame) => void): () => void {
  const bus = busFor(ml);
  bus.subs.add(cb);
  bus.last = undefined;
  bus.emit();
  return () => void bus.subs.delete(cb);
}

/** For camera changes made without a MapLibre move event (the limit rebound writes the transform directly). */
export function pokeCameraFrame(ml: MlMap): void {
  (busFor(ml) as Bus & { schedule: () => void }).schedule();
}
