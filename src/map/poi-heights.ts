// The places of interest with the height of the building each one stands in, so that a place floats at its roof when the map is tilted
// (`symbol-height-offset`, in metres), like in Apple Maps. The tiles' places have no height: after the view settles, the places and the
// buildings of the loaded tiles are joined here (a point in the building's outline) and handed to the GeoJSON source the place layers read.
import type { Map as MlMap } from 'maplibre-gl';
import { inFootprint } from '../data/landmarks';
import { OFM_BUILDINGS_SOURCE_ID } from './buildings-tilt';
import { POI_GEO_SOURCE, heightOffset, poiLayerIds, poiOccluded } from './poi';

const DELAY_MS = 250;
/** buildings are looked up through a grid of cells this big (degrees, about 200 m) */
const CELL = 0.002;
/** places outside the view by this share are left out */
const MARGIN = 0.25;

type Poly = [number, number][][];
interface Building { box: [number, number, number, number]; poly: Poly[]; h: number }
interface Place { key: string; x: number; y: number; h: number }
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
  let grid = new Map<string, Building[]>();
  let placed = new Map<string, Place>();
  let maxH = 0;
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
    applyShare();
    if (!o.active() || ml.getZoom() < 12) return;
    const src = ml.getSource(POI_GEO_SOURCE) as { setData(d: unknown): void } | undefined;
    if (!src) return;
    const b = ml.getBounds();
    const padLng = (b.getEast() - b.getWest()) * MARGIN;
    const padLat = (b.getNorth() - b.getSouth()) * MARGIN;
    const [w, s, e, n] = [b.getWest() - padLng, b.getSouth() - padLat, b.getEast() + padLng, b.getNorth() + padLat];

    // buildings of the loaded tiles, in a grid
    grid = new Map<string, Building[]>();
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
        for (const ring of poly[0] ? poly.map((q) => q[0]!) : []) for (const [x, y] of ring) { bw = Math.min(bw, x); be = Math.max(be, x); bs = Math.min(bs, y); bn = Math.max(bn, y); }
        if (be < w || bw > e || bn < s || bs > n) continue;
        const key = `${bw.toFixed(6)},${bs.toFixed(6)},${h}`;
        if (seen.has(key)) continue; // a building cut by a tile edge comes once per tile
        seen.add(key);
        maxH = Math.max(maxH, h);
        const bld: Building = { box: [bw, bs, be, bn], poly, h };
        for (let x = Math.floor(bw / CELL); x <= Math.floor(be / CELL); x++) for (let y = Math.floor(bs / CELL); y <= Math.floor(bn / CELL); y++) {
          const k = `${x}/${y}`;
          (grid.get(k) ?? grid.set(k, []).get(k)!).push(bld);
        }
      }
    }

    const places = new Map<string, GeoJSON.Feature>();
    for (const f of ml.querySourceFeatures('ofm', { sourceLayer: 'poi' })) {
      if (f.geometry.type !== 'Point') continue;
      const [x, y] = f.geometry.coordinates as [number, number];
      if (x < w || x > e || y < s || y > n) continue;
      const p = f.properties as Record<string, unknown>;
      if (!p.name) continue;
      const key = `${p.name}|${x.toFixed(6)}|${y.toFixed(6)}`;
      if (places.has(key)) continue;
      let h = 0;
      for (const bld of grid.get(`${Math.floor(x / CELL)}/${Math.floor(y / CELL)}`) ?? []) {
        const [bw, bs, be, bn] = bld.box;
        if (bld.h <= h || x < bw || x > be || y < bs || y > bn) continue;
        if (inFootprint(x, y, bld.poly as never)) h = bld.h;
      }
      places.set(key, { type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: { key, class: p.class, subclass: p.subclass, name: p.name, 'name:latin': p['name:latin'], rank: p.rank, h } });
    }
    placed = new Map([...places.entries()].map(([key, f]) => [key, { key, x: (f.geometry as GeoJSON.Point).coordinates[0]!, y: (f.geometry as GeoJSON.Point).coordinates[1]!, h: (f.properties as { h: number }).h }]));
    const features = [...places.values()];
    const sig = features.map((f) => `${(f.properties as { name: string }).name}${(f.properties as { h: number }).h}`).sort().join('|');
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
      for (const key of keys) {
        const p = placed.get(key);
        if (!p) continue;
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
          const cell = grid.get(`${Math.floor(x / CELL)}/${Math.floor(y / CELL)}`);
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

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(run, DELAY_MS);
  };
  const onSource = (e: { sourceId?: string }) => { if (e.sourceId === 'ofm' || e.sourceId === OFM_BUILDINGS_SOURCE_ID || e.sourceId === 'ofm-landmarks') schedule(); };
  ml.on('moveend', schedule);
  ml.on('move', scheduleOcclusion);
  ml.on('sourcedata', onSource);
  ml.on('pitch', applyShare);
  schedule();
  return {
    refresh: schedule,
    destroy() {
      clearTimeout(timer);
      ml.off('moveend', schedule);
      ml.off('move', scheduleOcclusion);
      clearTimeout(occTimer);
      cancelAnimationFrame(raf);
      ml.off('sourcedata', onSource);
      ml.off('pitch', applyShare);
    },
  };
}

