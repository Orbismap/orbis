// Leaves the OSM buildings out of the 2.5D layers where a 3D landmark model stands in for them. The model has priority.
// OpenFreeMap feature ids are the OSM id × 10 (+2 way, +3 relation), which the landmarks dataset lists for every model
// (data/landmarks.ts). Every fill-extrusion layer on the building source gets `["!", ["in", ["id"], ids]]` added to its own filter;
// the filters as the style made them are remembered and come back when the mask is empty.
import type { FilterSpecification, Map as MlMap } from 'maplibre-gl';
import { landmarkMask } from '../data/landmarks';

type Filter = FilterSpecification | undefined;
const original = new Map<string, Filter>();
const applied = new Map<string, string>();

const isBuildingLayer = (l: { type: string; source?: string; 'source-layer'?: string }) =>
  l.type === 'fill-extrusion' && l['source-layer'] === 'building' && l.source === 'ofm';

/** The filter of a layer with the mask added. */
export function maskedFilter(base: Filter, ids: ReadonlySet<number>): Filter {
  if (!ids.size) return base;
  const hide = ['!', ['in', ['id'], ['literal', [...ids].sort((a, b) => a - b)]]] as unknown as FilterSpecification;
  return base ? (['all', base, hide] as unknown as FilterSpecification) : hide;
}

/** Applies the current mask to every building layer of the style (cheap when nothing changed). */
export function applyLandmarkMask(ml: MlMap): void {
  const ids = landmarkMask.peek().ids;
  const sig = [...ids].sort((a, b) => a - b).join(',');
  for (const l of ml.getStyle().layers ?? []) {
    if (!isBuildingLayer(l as never)) continue;
    if (!original.has(l.id)) original.set(l.id, (l as { filter?: Filter }).filter);
    if (applied.get(l.id) === sig) continue;
    applied.set(l.id, sig);
    ml.setFilter(l.id, maskedFilter(original.get(l.id), ids) ?? null);
  }
}

/** Keeps the style's building layers masked: when the mask changes and when layers come and go. Returns the stop function. */
export function watchLandmarkMask(ml: MlMap): () => void {
  const apply = () => { try { applyLandmarkMask(ml); } catch { /* no style yet: the next styledata applies it */ } };
  const stop = landmarkMask.subscribe(apply);
  ml.on('styledata', apply);
  return () => {
    stop();
    ml.off('styledata', apply);
    landmarkMask.value = { ids: new Set(), boxes: [] };
    apply();
    original.clear();
    applied.clear();
  };
}
