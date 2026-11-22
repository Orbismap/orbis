// The buildings a 3D landmark stands in for are cut out of the basemap, so the model has priority (and never a house inside it).
// OpenFreeMap merges neighbouring buildings, so an id is not enough: building tiles go through a protocol that subtracts the
// landmarks' outlines (map/landmark-geometry.ts, loaded lazily). The 2.5D building layers and the detailed Pro buildings read this
// source instead of `ofm` while a landmark is in view; without one the layers are back on `ofm`, untouched.
import * as maplibregl from 'maplibre-gl';
import type { Map as MlMap, VectorTileSource } from 'maplibre-gl';
import { EMPTY_MASK, landmarkMask, type LandmarkMask } from '../data/landmarks';
import type { Footprint } from './landmark-geometry';
import { signal } from '@preact/signals';

export const MASKED_SOURCE = 'ofm-landmarks';
const PROTOCOL = 'orbis-landmark-buildings';
const BASE_SOURCE = 'ofm';
const SETTLE_MS = 150;

/** The source the building layers read now: `ofm`, or the cut one while landmarks are in view (for readers of the building features). */
export const buildingSource = signal(BASE_SOURCE);

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
    if (!isBuilding(l as never, from)) return;
    const spec = { ...structuredClone(l), source: to } as typeof l;
    const before = layers.slice(i + 1).find((n) => !isBuilding(n as never, from))?.id;
    ml.removeLayer(l.id);
    ml.addLayer(spec, before);
  });
}

/**
 * Follows `landmarkMask`: while it holds landmarks, the building layers read the cut source; the cut is renewed whenever the set
 * changes (the tiles are loaded anew, the old ones stay on screen until then). Returns the stop function.
 */
export function watchLandmarkBuildings(ml: MlMap): () => void {
  let active = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dead = false;

  const snapshot = (mask: LandmarkMask): Footprint[] => mask.footprints.map((f) => ({ geometry: f.geometry, ids: f.ids }));

  const enable = (mask: LandmarkMask) => {
    const base = ml.getSource(BASE_SOURCE) as VectorTileSource | undefined;
    const tiles = base?.tiles?.[0];
    if (!base || !tiles) return false;
    template = tiles;
    registerProtocol();
    revision++;
    snapshots.set(revision, snapshot(mask));
    while (snapshots.size > 4) snapshots.delete(snapshots.keys().next().value!);
    const src = ml.getSource(MASKED_SOURCE) as VectorTileSource | undefined;
    if (src) src.setTiles([tilesUrl()]);
    else ml.addSource(MASKED_SOURCE, { type: 'vector', tiles: [tilesUrl()], minzoom: base.minzoom ?? 0, maxzoom: base.maxzoom ?? 14 });
    if (!active) { active = true; moveLayers(ml, BASE_SOURCE, MASKED_SOURCE); buildingSource.value = MASKED_SOURCE; }
    return true;
  };
  const disable = () => {
    if (!active) return;
    active = false;
    moveLayers(ml, MASKED_SOURCE, BASE_SOURCE);
    buildingSource.value = BASE_SOURCE;
    if (ml.getSource(MASKED_SOURCE)) ml.removeSource(MASKED_SOURCE);
  };
  const apply = () => {
    timer = undefined;
    if (dead) return;
    const mask = landmarkMask.peek();
    try {
      if (mask.ids.size || mask.footprints.length) enable(mask);
      else disable();
    } catch (e) {
      console.warn('[landmarks] could not cut the buildings', e);
    }
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(apply, SETTLE_MS); };
  // a basemap switch brings its own building layers on `ofm`: they follow while landmarks are in view
  const onStyle = () => {
    if (!active || dead) return;
    const layers = ml.getStyle().layers ?? [];
    if (layers.some((l) => isBuilding(l as never, BASE_SOURCE))) moveLayers(ml, BASE_SOURCE, MASKED_SOURCE);
  };
  const stop = landmarkMask.subscribe(schedule);
  ml.on('styledata', onStyle);
  return () => {
    dead = true;
    clearTimeout(timer);
    stop();
    ml.off('styledata', onStyle);
    landmarkMask.value = EMPTY_MASK;
    try { disable(); } catch { /* the style is gone */ }
  };
}
