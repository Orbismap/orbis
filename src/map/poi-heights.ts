// The places of interest with the height of the building each one stands in, so that a place floats at its roof when the map is tilted
// (`symbol-height-offset`, in metres), like in Apple Maps. The tiles' places have no height: after the view settles, the places and the
// buildings of the loaded tiles are joined here (a point in the building's outline) and handed to the GeoJSON source the place layers read.
import type { Map as MlMap } from 'maplibre-gl';
import { inFootprint } from '../data/landmarks';
import { OFM_BUILDINGS_SOURCE_ID } from './buildings-tilt';
import { boxInside, reachBox, type Box } from './view-reach';
import { pitchZoomBonus } from './buildings-tilt';
import { POI_GEO_SOURCE, heightOffset, poiLayerIds, poiOccluded, poiResolve, poiTierLimit, poiZoomBonus } from './poi';

const DELAY_MS = 250;
/** buildings are looked up through a grid of cells this big (degrees, about 200 m) */
const CELL = 0.002;
/** places outside the view by this share are left out */
const MARGIN = 0.25;
/** the work is put off at most this long (ms) while tiles keep arriving */
const MAX_WAIT_MS = 1200;
/** a place has at most this many sight lines followed per pass (the nearest first) */
const MAX_SIGHT = 500;

type Poly = [number, number][][];
interface Building { box: [number, number, number, number]; poly: Poly[]; h: number }
interface Place { key: string; x: number; y: number; h: number }
/** one number per grid cell (a string per cell and building was most of the garbage of a pass) */
const cellKey = (x: number, y: number) => (Math.floor(x / CELL) + 100_000) * 200_000 + Math.floor(y / CELL) + 100_000;
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
/** metres per degree of latitude */
const M_LAT = 111_320;
/** the sight line is followed this far from a place (m), in at most this many steps */
const SIGHT_M = 1500;
const SIGHT_STEPS = 48;
/** under this tilt (degrees) buildings hide nothing worth the work */
const MIN_PITCH = 8;
/** the camera has been still this long (ms) */
const THROTTLE_MS = 180;
/** a place fades in or out over this long (ms) */
const FADE_MS = 220;

export interface PoiHeights {
  /** Looks again soon (the view moved, tiles arrived, the layers were switched on). */
  refresh(): void;
  destroy(): void;
}

export function startPoiHeights(ml: MlMap, o: { active: () => boolean; share: () => number }): PoiHeights {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastKey = '';
  let lastShare = -1;
  let grid = new Map<number, Building[]>();
  let placed = new Map<string, Place>();
  let maxH = 0;
  /** what the last pass covered: the ground, and the highest tier of place it kept. While the view stays inside and nothing arrived, the pass is skipped. */
  let built: { box: Box; tier: number } | undefined;
  let dirty = true;
  let waitingSince = 0;
  let shareTimer: ReturnType<typeof setTimeout> | undefined;
  let occTimer: ReturnType<typeof setTimeout> | undefined;
  /** the places a building is in front of (what the filter will leave out once they have faded) */
  const target = new Set<string>();
  /** places mid-fade: alpha now and where it goes */
  const anim = new Map<string, { a: number; to: 0 | 1 }>();
  let raf = 0;
  let lastTick = 0;

  /** the layers' height offset follows the buildings' tilt; re-laid out only on a visible change */
  const applyShare = () => {
    const share = Math.round(o.share() * 50) / 50;
    if (share === lastShare) return;
    lastShare = share;
    for (const id of poiLayerIds) if (ml.getLayer(id)) ml.setLayoutProperty(id, 'symbol-height-offset', heightOffset(share));
  };

  /** The source the visible building layer reads: the plain building tiles, or the cut ones while a 3D landmark replaces buildings (map/landmark-buildings.ts). */
  const buildingSource = (): string | undefined => {
    const l = ml.getStyle().layers.find((x) => x.type === 'fill-extrusion' && x.layout?.visibility !== 'none' && 'source' in x && (x as { 'source-layer'?: string })['source-layer'] === 'building') as { source?: string } | undefined;
    return l?.source ?? (ml.getSource(OFM_BUILDINGS_SOURCE_ID) ? OFM_BUILDINGS_SOURCE_ID : undefined);
  };

  const run = () => {
    timer = undefined;
    const bonus = pitchZoomBonus(ml.getPitch());
    if (bonus !== poiZoomBonus.peek()) poiZoomBonus.value = bonus;
    waitingSince = 0;
    applyShare();
    if (!o.active() || ml.getZoom() < 12) { built = undefined; return; }
    const src = ml.getSource(POI_GEO_SOURCE) as { setData(d: unknown): void } | undefined;
    if (!src) return;
    // the places the zoom can show soon: the filter picks by the exact zoom, the source only needs not to miss any (a tier that is a zoom ahead)
    const tier = Math.min(5, poiTierLimit(ml.getZoom() + pitchZoomBonus(ml.getPitch()) + 1, 1));
    const view = reachBox(ml);
    // nothing arrived and the view is still inside what the last pass covered: the grid and the source stay as they are
    if (!dirty && built && built.tier >= tier && boxInside(built.box, view)) { occlude(); return; }
    dirty = false;
    const padLng = (view[2] - view[0]) * MARGIN;
    const padLat = (view[3] - view[1]) * MARGIN;
    const [w, s, e, n] = [view[0] - padLng, view[1] - padLat, view[2] + padLng, view[3] + padLat];
    built = { box: [w, s, e, n], tier };

    // buildings of the loaded tiles, in a grid
    grid = new Map<number, Building[]>();
    maxH = 0;
    const seen = new Set<string>();
    const bsrc = buildingSource();
    if (bsrc) {
      for (const f of ml.querySourceFeatures(bsrc, { sourceLayer: 'building' })) {
        const g = f.geometry;
        if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') continue;
        const p = f.properties as { render_height?: number; render_min_height?: number };
        const h = Number(p.render_height);
        if (!(h > 0) || Number(p.render_min_height) > 0) continue; // a part that hangs in the air is no roof to stand on
        const poly = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as Poly[];
        let [bw, bs, be, bn] = [Infinity, Infinity, -Infinity, -Infinity];
        for (const q of poly) for (const [x, y] of q[0]!) { if (x < bw) bw = x; if (x > be) be = x; if (y < bs) bs = y; if (y > bn) bn = y; }
        if (be < w || bw > e || bn < s || bs > n) continue;
        const key = `${bw.toFixed(6)},${bs.toFixed(6)},${h}`;
        if (seen.has(key)) continue; // a building cut by a tile edge comes once per tile
        seen.add(key);
        if (h > maxH) maxH = h;
        const bld: Building = { box: [bw, bs, be, bn], poly, h };
        for (let x = Math.floor(bw / CELL); x <= Math.floor(be / CELL); x++) for (let y = Math.floor(bs / CELL); y <= Math.floor(bn / CELL); y++) {
          const k = (x + 100_000) * 200_000 + y + 100_000;
          (grid.get(k) ?? grid.set(k, []).get(k)!).push(bld);
        }
      }
    }

    const features: GeoJSON.Feature[] = [];
    const next = new Map<string, Place>();
    let sum = 0;
    for (const f of ml.querySourceFeatures('ofm', { sourceLayer: 'poi' })) {
      if (f.geometry.type !== 'Point') continue;
      const [x, y] = f.geometry.coordinates as [number, number];
      if (x < w || x > e || y < s || y > n) continue;
      const p = f.properties as Record<string, unknown>;
      const r = poiResolve(p); // no name, a kind the map does not show, small print: never enters the source
      if (!r || r.tier > tier) continue;
      const key = `${p.name}|${x.toFixed(6)}|${y.toFixed(6)}`;
      if (next.has(key)) continue;
      let h = 0;
      for (const bld of grid.get(cellKey(x, y)) ?? []) {
        const [bw, bs, be, bn] = bld.box;
        if (bld.h <= h || x < bw || x > be || y < bs || y > bn) continue;
        if (inFootprint(x, y, bld.poly as never)) h = bld.h;
      }
      next.set(key, { key, x, y, h });
      sum = (sum + hash(key + h)) >>> 0; // order-free signature: the tiles come in any order
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: { key, class: p.class, subclass: p.subclass, name: p.name, 'name:latin': p['name:latin'], rank: p.rank, h, ...r } });
    }
    placed = next;
    // setData re-tiles the whole source in the worker and lays every place layer out again: only when something changed
    const sig = `${features.length}:${sum}`;
    if (sig !== lastKey) {
      lastKey = sig;
      src.setData({ type: 'FeatureCollection', features });
    }
    occlude();
  };

  /**
   * Places a building hides from the camera: the sight line from the place to the camera is followed over the ground; where it passes through
   * a footprint lower than the line is, the building is in front (the same heights the buildings are drawn at). The map has nothing like it,
   * and a floating place is otherwise seen through the walls. Hidden ones leave the filter, so the room they held is free for others.
   */
  const occlude = () => {
    occTimer = undefined;
    const pitch = ml.getPitch();
    let hidden: string[] = [];
    const share = o.share();
    if (o.active() && share > 0 && pitch >= MIN_PITCH && placed.size && grid.size) {
      const c = ml.getCenter();
      const kx = M_LAT * Math.cos((c.lat * Math.PI) / 180);
      const rad = (pitch * Math.PI) / 180;
      const bear = (ml.getBearing() * Math.PI) / 180;
      const fov = (ml as unknown as { getVerticalFieldOfView?: () => number }).getVerticalFieldOfView?.() ?? 36.87;
      const pxPerM = (512 * 2 ** ml.getZoom()) / (40_075_016.686 * Math.cos((c.lat * Math.PI) / 180));
      const dist = (0.5 * ml.getCanvas().clientHeight) / Math.tan((fov * Math.PI) / 360) / pxPerM;
      // the camera in metres from the map's centre (x east, y north, z up)
      const cx = -Math.sin(bear) * dist * Math.sin(rad);
      const cy = -Math.cos(bear) * dist * Math.sin(rad);
      const cz = dist * Math.cos(rad);
      // only what is drawn (and what is hidden now, to see whether it stays so): the map says which places have room on screen
      const ids = [...poiLayerIds].filter((id) => ml.getLayer(id));
      const keys = new Set<string>(target);
      if (ids.length) for (const f of ml.queryRenderedFeatures({ layers: ids })) { const k = (f.properties as { key?: string } | null)?.key; if (k) keys.add(k); }
      const roofMax = 3 + share * maxH;
      // the nearest first and not more than MAX_SIGHT: what is far away is a few pixels, and a frame of the map is worth more than its exact answer
      let order: Place[] = [];
      for (const key of keys) { const p = placed.get(key); if (p) order.push(p); }
      if (order.length > MAX_SIGHT) {
        const d2 = (p: Place) => ((p.x - c.lng) * kx) ** 2 + ((p.y - c.lat) * M_LAT) ** 2;
        order = order.map((p) => [d2(p), p] as const).sort((a, b) => a[0] - b[0]).slice(0, MAX_SIGHT).map((e) => e[1]);
      }
      for (const p of order) {
        const px = (p.x - c.lng) * kx;
        const py = (p.y - c.lat) * M_LAT;
        const pz = (p.h > 0 ? 3 + share * p.h : 0) + 1;
        const dx = cx - px;
        const dy = cy - py;
        const horiz = Math.hypot(dx, dy);
        if (horiz < 1) continue;
        const reach = Math.min(horiz, SIGHT_M);
        const step = Math.max(6, reach / SIGHT_STEPS);
        for (let d = step + 4; d <= reach; d += step) {
          const t = d / horiz;
          if (pz + (cz - pz) * t > roofMax) break; // above the highest roof: nothing further along the line can hide it
          const x = p.x + (dx * t) / kx;
          const y = p.y + (dy * t) / M_LAT;
          const z = pz + (cz - pz) * t;
          const cell = grid.get(cellKey(x, y));
          if (!cell) continue;
          if (cell.some((bld) => 3 + share * bld.h > z + 2 && x >= bld.box[0] && x <= bld.box[2] && y >= bld.box[1] && y <= bld.box[3] && inFootprint(x, y, bld.poly as never))) { hidden.push(p.key); break; }
        }
      }
    }
    apply(new Set(hidden));
  };

  const setAlpha = (key: string, a: number) => ml.setFeatureState({ source: POI_GEO_SOURCE, id: key }, { a });
  /** Starts the fades the new set asks for: a place that is hidden leaves the filter only after it has faded out, one that comes back is first put back at 0. */
  const apply = (now: Set<string>) => {
    const filtered = new Set(poiOccluded.peek());
    let refilter = false;
    for (const k of now) {
      if (target.has(k)) continue;
      target.add(k);
      anim.set(k, { a: anim.get(k)?.a ?? 1, to: 0 });
    }
    for (const k of [...target]) {
      if (now.has(k)) continue;
      target.delete(k);
      if (filtered.has(k)) { filtered.delete(k); refilter = true; setAlpha(k, 0); anim.set(k, { a: 0, to: 1 }); }
      else anim.set(k, { a: anim.get(k)?.a ?? 0, to: 1 });
    }
    if (refilter) poiOccluded.value = [...filtered].sort();
    if (anim.size && !raf) { lastTick = performance.now(); raf = requestAnimationFrame(tick); }
  };
  const tick = (now: number) => {
    raf = 0;
    const step = (now - lastTick) / FADE_MS;
    lastTick = now;
    const out: string[] = [];
    for (const [k, e] of anim) {
      e.a = Math.min(1, Math.max(0, e.a + (e.to === 1 ? step : -step)));
      if (e.to === 0 && e.a <= 0) { out.push(k); anim.delete(k); continue; }
      if (e.to === 1 && e.a >= 1) { ml.removeFeatureState({ source: POI_GEO_SOURCE, id: k }); anim.delete(k); continue; }
      setAlpha(k, e.a);
    }
    // faded out: now the filter leaves them out, so the room they held is free
    if (out.length) poiOccluded.value = [...new Set([...poiOccluded.peek(), ...out])].sort();
    if (anim.size) raf = requestAnimationFrame(tick);
  };

  // not while the camera is moving: the work (and the new filters, which lay the symbols out again) would take frames from the map; it runs when the camera rests
  const scheduleOcclusion = () => {
    clearTimeout(occTimer);
    occTimer = setTimeout(occlude, THROTTLE_MS);
  };

  // debounced, but not for ever: tiles that keep arriving (a steep view loads many) must not hold the work back past MAX_WAIT_MS
  const schedule = () => {
    clearTimeout(timer);
    const now = performance.now();
    if (!waitingSince) waitingSince = now;
    timer = setTimeout(run, Math.max(0, Math.min(DELAY_MS, waitingSince + MAX_WAIT_MS - now)));
  };
  const onSource = (e: { sourceId?: string; sourceDataType?: string }) => {
    if (e.sourceDataType === 'metadata') return;
    if (e.sourceId === 'ofm' || e.sourceId === OFM_BUILDINGS_SOURCE_ID || e.sourceId === 'ofm-landmarks') { dirty = true; schedule(); }
  };
  // a change of the height offset lays the layers out again in the worker: while the camera tilts that is at most a few times a second, not once per frame
  const onPitch = () => {
    const bonus = pitchZoomBonus(ml.getPitch());
    if (bonus !== poiZoomBonus.peek()) poiZoomBonus.value = bonus;
    schedulePitch();
  };
  const schedulePitch = () => { if (!shareTimer) shareTimer = setTimeout(() => { shareTimer = undefined; applyShare(); }, 200); };
  ml.on('moveend', schedule);
  ml.on('move', scheduleOcclusion);
  ml.on('sourcedata', onSource);
  ml.on('pitch', onPitch);
  schedule();
  return {
    refresh: () => { dirty = true; schedule(); },
    destroy() {
      clearTimeout(timer);
      ml.off('moveend', schedule);
      ml.off('move', scheduleOcclusion);
      clearTimeout(occTimer);
      cancelAnimationFrame(raf);
      ml.off('sourcedata', onSource);
      ml.off('pitch', onPitch);
      clearTimeout(shareTimer);
    },
  };
}

