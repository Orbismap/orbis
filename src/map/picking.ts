// One click/hover handler for all layers. Layers register their map layer ids and a PickHandler via engine.onPick.
import type { GeoJSONSource, Map as MlMap, MapGeoJSONFeature, MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
import type { LngLat } from '../core/geo';
import type { PickHandler } from './types';

interface Entry { ids: Set<string>; h: PickHandler }

export const TOLERANCE = { mouse: 6, touch: 14 } as const;

export interface Picking {
  add(layerIds: string[], h: PickHandler): () => void;
  destroy(): void;
}

const isTouch = (e: MapMouseEvent | MapTouchEvent) => {
  const o = e.originalEvent as Event & { pointerType?: string };
  return e.type.startsWith('touch') || o?.type?.startsWith('touch') || o?.pointerType === 'touch';
};

const keyOf = (f: MapGeoJSONFeature) => (f.id === undefined ? undefined : `${f.source}|${f.sourceLayer ?? ''}|${f.id}`);

export function createPicking(ml: MlMap, onMiss: (at: { lng: number; lat: number } | null) => void): Picking {
  const entries = new Set<Entry>();
  let hovered: { feature: MapGeoJSONFeature; key: string | undefined; entry: Entry } | undefined;

  const allIds = () => {
    const out: string[] = [];
    for (const e of entries) for (const id of e.ids) if (ml.getLayer(id)) out.push(id);
    return out;
  };

  function query(point: { x: number; y: number }, tol: number): { feature: MapGeoJSONFeature; entry: Entry } | undefined {
    const layers = allIds();
    if (!layers.length) return undefined;
    const feats = ml.queryRenderedFeatures([[point.x - tol, point.y - tol], [point.x + tol, point.y + tol]], { layers });
    const top = feats[0];
    if (!top) return undefined;
    // among the features of the top layer, prefer the one closest to the pointer (points) – others keep query order
    let best = top;
    let bestD = Infinity;
    for (const f of feats) {
      if (f.layer.id !== top.layer.id) continue;
      if (f.geometry.type !== 'Point') {
        best = top;
        break;
      }
      const p = ml.project(f.geometry.coordinates as [number, number]);
      const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    for (const entry of entries) if (entry.ids.has(best.layer.id)) return { feature: best, entry };
    return undefined;
  }

  function setHoverState(f: MapGeoJSONFeature, on: boolean) {
    if (f.id === undefined) return;
    try {
      ml.setFeatureState({ source: f.source, sourceLayer: f.sourceLayer, id: f.id }, { hover: on });
    } catch {
      /* source removed meanwhile */
    }
  }

  function clearHover() {
    if (!hovered) return;
    setHoverState(hovered.feature, false);
    hovered.entry.h.hover?.(null);
    hovered = undefined;
    ml.getCanvas().style.cursor = '';
  }

  const onClick = (e: MapMouseEvent) => {
    const hit = query(e.point, isTouch(e) ? TOLERANCE.touch : TOLERANCE.mouse);
    if (!hit) {
      onMiss({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      return;
    }
    const { feature, entry } = hit;
    const p = feature.properties as Record<string, unknown> | null;
    if (p?.cluster && typeof p.cluster_id === 'number') {
      const src = ml.getSource(feature.source) as GeoJSONSource | undefined;
      const c = feature.geometry.type === 'Point' ? (feature.geometry.coordinates as [number, number]) : undefined;
      void src?.getClusterExpansionZoom(p.cluster_id).then((zoom) => c && ml.easeTo({ center: c, zoom: zoom + 0.5, duration: 500 }));
      return;
    }
    onMiss(null);
    entry.h.click?.(feature, [e.lngLat.lng, e.lngLat.lat] as LngLat);
  };

  let raf = 0;
  let lastMove: MapMouseEvent | undefined;
  const onMove = (e: MapMouseEvent) => {
    lastMove = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const ev = lastMove;
      if (!ev || ml.isMoving()) return;
      const hit = query(ev.point, TOLERANCE.mouse);
      const key = hit ? keyOf(hit.feature) : undefined;
      if (hit && hovered && key !== undefined && key === hovered.key) return;
      clearHover();
      if (hit) {
        hovered = { feature: hit.feature, key, entry: hit.entry };
        setHoverState(hit.feature, true);
        hit.entry.h.hover?.(hit.feature);
        ml.getCanvas().style.cursor = 'pointer';
      }
    });
  };
  const onLeave = () => clearHover();

  ml.on('click', onClick);
  ml.on('mousemove', onMove);
  ml.on('mouseout', onLeave);
  ml.on('movestart', onLeave);

  return {
    add(layerIds, h) {
      const entry: Entry = { ids: new Set(layerIds), h };
      entries.add(entry);
      return () => {
        if (hovered?.entry === entry) clearHover();
        entries.delete(entry);
      };
    },
    destroy() {
      ml.off('click', onClick);
      ml.off('mousemove', onMove);
      ml.off('mouseout', onLeave);
      ml.off('movestart', onLeave);
      if (raf) cancelAnimationFrame(raf);
      entries.clear();
    },
  };
}
