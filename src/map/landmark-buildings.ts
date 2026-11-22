// The buildings a 3D landmark stands in for are cut out of the basemap, so the model has priority (and never a house inside it).
// OpenFreeMap merges neighbouring buildings, so an id is not enough: building tiles go through a protocol that subtracts the
// landmarks' outlines (map/landmark-geometry.ts, loaded lazily). The 2.5D building layers and the detailed Pro buildings read this
// source instead of `ofm` from the start (an empty cut passes the tiles on untouched): the layers never change source while the map runs, which
// shows as the buildings going away and coming back. When landmarks arrive, the cut is renewed and the old tiles stay on screen until the new ones are in.
import * as maplibregl from 'maplibre-gl';
import type { Map as MlMap, VectorTileSource } from 'maplibre-gl';
import { EMPTY_MASK, landmarkMask, type LandmarkMask } from '../data/landmarks';
import type { Footprint } from './landmark-geometry';
import { signal } from '@preact/signals';
import { OFM_BUILDINGS_SOURCE_ID, useDetailedBuildingTiles } from './buildings-tilt';

export const MASKED_SOURCE = 'ofm-landmarks';
const PROTOCOL = 'orbis-landmark-buildings';
const BASE_SOURCE = OFM_BUILDINGS_SOURCE_ID;
/** an invisible layer on the cut source: a source only loads tiles for a visible layer, and the building layers may all be hidden (Pro draws the buildings, features/buildings3d/roofs-source.ts reads the tiles) */
const KEEP_LAYER = 'ofm-landmarks-keep';
const SETTLE_MS = 150;

/** The source the building layers read now: the cut one once the watch runs, `ofm` before (for readers of the building features). */
export const buildingSource = signal<string>(BASE_SOURCE);

let protocolReady = false;
let revision = 0;
const snapshots = new Map<number, Footprint[]>([[0, []]]);
const raw = new Map<string, Promise<Uint8Array>>();
let template = '';

function registerProtocol() {
  if (protocolReady) return;
  protocolReady = true;
  maplibregl.addProtocol(PROTOCOL, async (params, abort) => {
    const url = new URL(params.url);
    const [z, x, y] = url.pathname.replace(/^\/+/, '').replace('.pbf', '').split('/').map(Number) as [number, number, number];
    const rawUrl = template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
    let bytes = raw.get(rawUrl);
    if (!bytes) {
      bytes = fetch(rawUrl).then(async (r) => {
        if (!r.ok) throw new Error(`buildings: HTTP ${r.status}`);
        return new Uint8Array(await r.arrayBuffer());
      }).catch((e) => { raw.delete(rawUrl); throw e; });
      raw.set(rawUrl, bytes);
      if (raw.size > 64) raw.delete(raw.keys().next().value!);
    }
    const data = await bytes;
    if (abort.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const masks = snapshots.get(Number(url.searchParams.get('v'))) ?? [];
    if (!masks.length) return { data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer }; // nothing to cut: the tile as it is
    try {
      const { replaceBuildingTile } = await import('./landmark-geometry');
      const out = replaceBuildingTile(data, { z, x, y }, masks);
      return { data: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer };
    } catch (e) {
      console.warn('[landmarks] building tile left as it is', e);
      return { data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer };
    }
  });
}

const tilesUrl = () => `${PROTOCOL}://t/{z}/{x}/{y}.pbf?v=${revision}`;

const isBuilding = (l: { type: string; source?: string; 'source-layer'?: string }, source: string) =>
  l['source-layer'] === 'building' && l.source === source && (l.type === 'fill-extrusion' || l.type === 'fill' || l.type === 'line');

/** Moves every building layer from one source to the other, keeping its place in the stack and everything it was set to. */
function moveLayers(ml: MlMap, from: string, to: string) {
  const layers = ml.getStyle().layers ?? [];
  layers.forEach((l, i) => {
    if (l.id === KEEP_LAYER || !isBuilding(l as never, from)) return;
    const spec = { ...structuredClone(l), source: to } as typeof l;
    const before = layers.slice(i + 1).find((n) => n.id !== KEEP_LAYER && !isBuilding(n as never, from))?.id;
    ml.removeLayer(l.id);
    ml.addLayer(spec, before);
  });
}

/**
 * Puts the building layers on the cut source and follows `landmarkMask`: the cut is renewed whenever the set changes (the tiles are loaded
 * anew, the old ones stay on screen until then). Returns the stop function.
 */
export function watchLandmarkBuildings(ml: MlMap): () => void {
  let active = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dead = false;

  const snapshot = (mask: LandmarkMask): Footprint[] => mask.footprints.map((f) => ({ geometry: f.geometry, ids: f.ids }));

  const apply = () => {
    timer = undefined;
    if (dead) return;
    try {
      const base = ml.getSource(BASE_SOURCE) as VectorTileSource | undefined;
      const tiles = base?.tiles?.[0];
      if (!base || !tiles) return;
      template = tiles;
      registerProtocol();
      revision++;
      snapshots.set(revision, snapshot(landmarkMask.peek()));
      while (snapshots.size > 4) snapshots.delete(snapshots.keys().next().value!);
      const src = ml.getSource(MASKED_SOURCE) as VectorTileSource | undefined;
      if (src) src.setTiles([tilesUrl()]);
      else ml.addSource(MASKED_SOURCE, { type: 'vector', tiles: [tilesUrl()], minzoom: base.minzoom ?? 0, maxzoom: base.maxzoom ?? 14 });
      useDetailedBuildingTiles(ml, MASKED_SOURCE);
      if (!ml.getLayer(KEEP_LAYER)) ml.addLayer({ id: KEEP_LAYER, type: 'fill', source: MASKED_SOURCE, 'source-layer': 'building', minzoom: 12, paint: { 'fill-opacity': 0 } });
      if (!active) { active = true; moveLayers(ml, BASE_SOURCE, MASKED_SOURCE); buildingSource.value = MASKED_SOURCE; }
    } catch (e) {
      console.warn('[landmarks] could not cut the buildings', e);
    }
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(apply, SETTLE_MS); };
  // a basemap switch brings its own building layers on `ofm`: they follow
  const onStyle = () => {
    if (!active || dead) return;
    const layers = ml.getStyle().layers ?? [];
    if (layers.some((l) => isBuilding(l as never, BASE_SOURCE))) moveLayers(ml, BASE_SOURCE, MASKED_SOURCE);
  };
  // the first cut at once (nothing to cut yet): from then on the layers stay where they are
  apply();
  // a changed set renews the cut; the same set again (a new object) does not reload every tile
  let seen = '';
  const key = (m: LandmarkMask) => [...m.ids].sort().join(',') + '|' + m.footprints.length;
  seen = key(landmarkMask.peek());
  const stop = landmarkMask.subscribe((m) => { const k = key(m); if (k !== seen) { seen = k; schedule(); } });
  ml.on('styledata', onStyle);
  return () => {
    dead = true;
    clearTimeout(timer);
    stop();
    ml.off('styledata', onStyle);
    landmarkMask.value = EMPTY_MASK;
    try {
      if (active) {
        active = false;
        moveLayers(ml, MASKED_SOURCE, BASE_SOURCE);
        buildingSource.value = BASE_SOURCE;
      }
      if (ml.getLayer(KEEP_LAYER)) ml.removeLayer(KEEP_LAYER);
      if (ml.getSource(MASKED_SOURCE)) ml.removeSource(MASKED_SOURCE);
    } catch { /* the style is gone */ }
  };
}
