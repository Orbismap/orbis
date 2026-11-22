// 2.5D buildings whose height follows the camera TILT instead of the zoom: FLAT_SHARE of their real height at pitch 0, the full
// height from TILT_FULL_DEG on, in between linear. One simple factor for all heights (walls, parts, steps of a roof), so the shape
// stays the same, only flatter. On top MIN_HEIGHT_M metres at every pitch (not fully flat, so the 3D terrain does not poke through the roofs).
// The 3D landmark models use the same factor (`buildingHeightFactor`, handed to the extension by the host).
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

/** From this camera tilt on, buildings have their full height. */
export const TILT_FULL_DEG = 30;
/** Share of the real height buildings keep when the map is seen from straight above (0.1: 90 % flatter). */
export const FLAT_SHARE = 0.1;
const MAX_Z = 24;
/** The vector source the building layers read: the OpenFreeMap tiles as 256 px tiles, so that buildings come from the zoom-14 tiles (see basemaps/vector.ts). */
export const OFM_BUILDINGS_SOURCE_ID = 'ofm-buildings';
const SOURCE = OFM_BUILDINGS_SOURCE_ID;

/**
 * Makes the map take a vector source for 256 px tiles, so that it asks for the tiles one zoom level higher: from zoom 13.5 on the zoom-14 tiles, which
 * hold the buildings with heights (the zoom-13 ones hold one block without). A vector source's tile size is fixed at 512 in its spec, but the
 * tile manager reads it from the source object each time.
 */
export function useDetailedBuildingTiles(ml: MlMap, id: string = OFM_BUILDINGS_SOURCE_ID): void {
  const source = ml.getSource(id) as unknown as { tileSize?: number } | undefined;
  if (source) source.tileSize = 256;
}

/** The zoom the 2.5D buildings start at (the `minzoom` of their layers). */
export const BUILDING_MIN_ZOOM = 13.5;
/**
 * A tilted view is finer near the camera than at its centre: at 65° the bottom of the screen is about 0.75 of a zoom level ahead of the centre,
 * while every zoom rule of the style (layer minzoom, `['zoom']`) counts the centre's zoom. This is the share of that lead the rules are given:
 * none up to 30° of tilt, 0.6 from 65° on, in steps of 0.1 so that the layers are not laid out again for every degree of a tilt gesture.
 */
export const pitchZoomBonus = (pitchDeg: number) => Math.round(Math.max(0, Math.min(1, (pitchDeg - 30) / 35)) * 6) / 10;
/** The buildings start earlier by at most this much: below 13 the map has no zoom-14 tiles, the only ones with heights (see useDetailedBuildingTiles). */
const MAX_BUILDING_BONUS = 0.5;

/** Lets the 2.5D building layers start at a lower zoom the more the view is tilted (see pitchZoomBonus). Only changes what differs. */
export function applyBuildingZoom(ml: MlMap) {
  const min = BUILDING_MIN_ZOOM - Math.min(MAX_BUILDING_BONUS, pitchZoomBonus(ml.getPitch()));
  const style = ml.getStyle();
  if (!style) return;
  for (const l of style.layers ?? []) {
    const sl = l as { id: string; type: string; minzoom?: number; maxzoom?: number; 'source-layer'?: string };
    if (sl.type !== 'fill-extrusion' || sl['source-layer'] !== 'building' || sl.minzoom === undefined) continue;
    // only the layers that start where the buildings start (the others are not ours to move)
    if (sl.minzoom > BUILDING_MIN_ZOOM + 1e-6 || sl.minzoom < BUILDING_MIN_ZOOM - MAX_BUILDING_BONUS - 1e-6 || Math.abs(sl.minzoom - min) < 1e-6) continue;
    ml.setLayerZoomRange(sl.id, min, sl.maxzoom ?? 24);
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Share of the real height shown at a pitch (degrees): FLAT_SHARE at 0°, 1 from TILT_FULL_DEG on. */
export const tiltFactor = (pitchDeg: number) => FLAT_SHARE + (1 - FLAT_SHARE) * clamp01(pitchDeg / TILT_FULL_DEG);

/** The same for the map now (1 when nothing is hooked): what a 3D model's height is scaled by. */
export const buildingHeightFactor = (ml: MlMap) => tiltFactor(ml.getPitch());

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

/** Draws building:part features and hides the outlines that have parts inside (OpenMapTiles marks those with hide_3d), otherwise the
 *  outline covers its parts and they never show up at their own height. */
export const BUILDING_FILTER: ExpressionSpecification = ['!', ['to-boolean', ['get', 'hide_3d']]];


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
  ml.on('idle', check);
  // a bucket can arrive between events; without the patch the composite expression draws the raw z*H heights (many times
  // a house's own height), so keep looking until a binder is there or the static fallback is in place
  const retry = setInterval(() => { if (patched || fellBack) { clearInterval(retry); return; } check(); }, 250);
  return () => {
    ml.off('sourcedata', check);
    ml.off('idle', check);
    clearInterval(retry);
    if (activeMap === ml) activeMap = undefined;
  };
}

/** Test/debug hook: whether the patch is active, and the factor last handed to the shader. */
export const buildingsTiltState = () => ({ patched, fellBack, drawn, lastK });
