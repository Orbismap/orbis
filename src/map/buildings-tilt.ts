// 2.5D buildings whose height follows the camera TILT instead of the zoom: MIN_HEIGHT_M metres at pitch 0
// (not fully flat, so the 3D terrain does not poke through the roofs), real height + MIN_HEIGHT_M at TILT_FULL_DEG.
// MapLibre has no `pitch` expression, and changing a data-driven paint property (setPaintProperty / global state) reloads the
// tiles in the worker, which is no option per frame. So we use the composite (zoom + feature) paint binder instead:
//   - the style expression is linear in zoom: z -> z * H (see tiltExpr), so a bucket parsed at tile zoom Z stores
//     [Z*H, (Z+1)*H] per vertex, and the shader does mix(min, max, u_height_t) (not clamped in GLSL),
//   - we replace the binder's setUniform (CompositeExpressionBinder.prototype, not exported) so that for OUR binders
//     t = k - Z, which gives exactly k*H, k = clamp(pitch / TILT_FULL_DEG, 0, 1). No tile is reloaded, pitch changes repaint anyway.
// Relied-on internals (maplibre-gl 6.17, pinned): style.tileManagers[src].getIds()/getTileByID(), tile.getBucket(layer),
// bucket.programConfigurations.get(id).binders[prop] with fields expression.zoomStops, uniformNames, zoom, setUniform(uniform, globals).
// If they are not found as expected, both layers fall back to static real heights (never the huge unpatched ones).
import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl';

export const TILT_FULL_DEG = 55;
const MAX_Z = 24;
const SOURCE = 'ofm';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Share of the real height shown at a pitch (degrees). */
export const tiltFactor = (pitchDeg: number) => clamp01(pitchDeg / TILT_FULL_DEG);

const HEIGHT: ExpressionSpecification = ['coalesce', ['to-number', ['get', 'render_height']], 9];
const BASE: ExpressionSpecification = ['coalesce', ['to-number', ['get', 'render_min_height']], 0];
/** Constant roof lift in metres, independent of the tilt: the 3D terrain is only sampled at the footprint vertices, so with a
 *  few decimetres of height the terrain in between pokes through the roof. Stored as the stop offset: mix(min, max, t) keeps it
 *  unscaled (c + t*v), so height = MIN_HEIGHT_M + k*H. */
export const MIN_HEIGHT_M = 3;
const tiltExpr = (v: ExpressionSpecification, c = 0): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 0, c, MAX_Z, ['+', c, ['*', MAX_Z, v]]];

/** fill-extrusion-height / -base for the style (zoom-linear, see above; the tilt factor is applied at draw time). */
export const BUILDING_HEIGHT = tiltExpr(HEIGHT, MIN_HEIGHT_M);
export const BUILDING_BASE = tiltExpr(BASE);

interface Binder {
  expression?: { zoomStops?: number[] };
  uniformNames?: string[];
  zoom: number;
  setUniform(uniform: { set(v: number): void }, globals: unknown, ...rest: unknown[]): void;
  __tilt?: boolean;
}
interface Tile { getBucket(layer: { id: string }): { programConfigurations?: { get(id: string): { binders?: Record<string, Binder> } | undefined } } | undefined }
interface TileManager { getIds(): string[]; getTileByID(id: string): Tile | undefined }

const isOurs = (b: Binder) => {
  const s = b.expression?.zoomStops, n = b.uniformNames?.[0];
  return !!s && s.length === 2 && s[0] === 0 && s[1] === MAX_Z && (n === 'u_height_t' || n === 'u_base_t');
};
const isComposite = (b: Binder | undefined): b is Binder =>
  !!b && typeof b.setUniform === 'function' && typeof b.zoom === 'number' && Array.isArray(b.expression?.zoomStops) && Array.isArray(b.uniformNames);

let activeMap: MlMap | undefined;
let patched = false;
let fellBack = false;
let drawn = 0;
let lastK = 0;

function patch(proto: Binder) {
  const original = proto.setUniform;
  proto.setUniform = function (this: Binder, uniform, globals, ...rest) {
    if (this.__tilt === undefined) this.__tilt = isOurs(this);
    if (!this.__tilt) return original.call(this, uniform, globals, ...rest);
    const k = tiltFactor(activeMap?.getPitch() ?? 0);
    lastK = k; drawn++;
    uniform.set(k - this.zoom);
  };
  patched = true;
}

let ids: string[] | undefined;
const extrusionIds = (ml: MlMap) => (ml.getStyle().layers ?? []).filter((l) => l.type === 'fill-extrusion').map((l) => l.id);

type Found = 'patched' | 'wait' | 'missing';
function discover(ml: MlMap): Found {
  const tm = (ml.style as unknown as { tileManagers?: Record<string, TileManager> }).tileManagers?.[SOURCE];
  if (!tm) return 'missing';
  ids ??= extrusionIds(ml);
  let sawBucket = false;
  for (const key of tm.getIds()) {
    const tile = tm.getTileByID(key);
    if (!tile) continue;
    for (const id of ids) {
      const config = tile.getBucket({ id })?.programConfigurations?.get(id);
      if (!config) continue;
      sawBucket = true;
      for (const prop of ['fill-extrusion-height', 'fill-extrusion-base']) {
        const b = config.binders?.[prop];
        if (isComposite(b) && isOurs(b)) { patch(Object.getPrototypeOf(b) as Binder); return 'patched'; }
      }
    }
  }
  return sawBucket ? 'missing' : 'wait';
}

function fallback(ml: MlMap) {
  if (fellBack) return;
  fellBack = true;
  console.warn('[buildings-tilt] MapLibre internals not found, buildings use static real heights');
  for (const id of extrusionIds(ml)) {
    ml.setPaintProperty(id, 'fill-extrusion-height', HEIGHT);
    ml.setPaintProperty(id, 'fill-extrusion-base', BASE);
  }
}

/** Hooks the tilt-driven building height into this map. Returns a disposer. */
export function installBuildingsTilt(ml: MlMap): () => void {
  activeMap = ml;
  const check = () => {
    if (patched || fellBack) return;
    try {
      const r = discover(ml);
      if (r === 'missing') fallback(ml);
    } catch { fallback(ml); }
  };
  // fires when a tile's buckets arrive on the main thread, i.e. before the frame that first draws them
  ml.on('sourcedata', check);
  return () => { ml.off('sourcedata', check); if (activeMap === ml) activeMap = undefined; };
}

/** Test/debug hook: whether the patch is active, and the factor last handed to the shader. */
export const buildingsTiltState = () => ({ patched, fellBack, drawn, lastK });
