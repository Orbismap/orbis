// One click/hover handler for all layers. Layers register their map layer ids and a PickHandler via engine.onPick.
import type { GeoJSONSource, Map as MlMap, MapGeoJSONFeature, MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
import type { LngLat } from '../core/geo';
import type { PickHandler } from './types';

interface Entry { ids: Set<string>; h: PickHandler }

/** Hold time of a long press (point query). */
export const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 6;

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

export function createPicking(ml: MlMap, onMiss: (at: { lng: number; lat: number } | null) => void, onLongPress?: (at: { lng: number; lat: number }) => void): Picking {
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

  // long press: pointer held still for LONG_PRESS_MS (500 ms); the click that follows the release is swallowed
  let press: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | undefined;
  let swallowClick = false;
  // browsers follow a touch with made-up mouse events: those must not start a second press or release the click lock
  let touched = -Infinity;
  const cancelPress = () => {
    if (press) clearTimeout(press.timer);
    press = undefined;
  };
  const onDown = (e: MapMouseEvent | MapTouchEvent) => {
    if (e.type === 'touchstart') touched = performance.now();
    else if (performance.now() - touched < 1000) return;
    cancelPress();
    swallowClick = false;
    if (!onLongPress || ('button' in e.originalEvent && (e.originalEvent as MouseEvent).button !== 0)) return;
    if (e.type === 'touchstart' && (e as MapTouchEvent).points && (e as MapTouchEvent).points.length > 1) return;
    const at = { lng: e.lngLat.lng, lat: e.lngLat.lat };
    press = {
      x: e.point.x,
      y: e.point.y,
      timer: setTimeout(() => {
        press = undefined;
        swallowClick = true;
        onLongPress(at);
      }, LONG_PRESS_MS),
    };
  };
  const onPressMove = (e: MapMouseEvent | MapTouchEvent) => {
    if (press && Math.hypot(e.point.x - press.x, e.point.y - press.y) > LONG_PRESS_SLOP) cancelPress();
  };

  const onClick = (e: MapMouseEvent) => {
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    const hit = query(e.point, isTouch(e) ? TOLERANCE.touch : TOLERANCE.mouse);
    if (!hit) {
      onMiss({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      return;
    }
    const { feature, entry } = hit;
    const p = feature.properties as Record<string, unknown> | null;
    if (p?.cluster === true) {
      const c = feature.geometry.type === 'Point' ? (feature.geometry.coordinates as [number, number]) : undefined;
      const zoomTo = (zoom: number) => c && ml.easeTo({ center: c, zoom, duration: 500 });
      if (typeof p.cluster_id === 'number') {
        const src = ml.getSource(feature.source) as GeoJSONSource | undefined;
        void src?.getClusterExpansionZoom(p.cluster_id).then((zoom) => zoomTo(zoom + 0.5));
      } else zoomTo(ml.getZoom() + 2); // precomputed clusters of vector tiles carry no expansion zoom
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

  ml.on('mousedown', onDown);
  ml.on('touchstart', onDown);
  ml.on('mousemove', onPressMove);
  ml.on('touchmove', onPressMove);
  ml.on('mouseup', cancelPress);
  const onTouchEnd = () => {
    touched = performance.now();
    cancelPress();
  };
  ml.on('touchend', onTouchEnd);
  ml.on('touchcancel', cancelPress);
  ml.on('dragstart', cancelPress);
  ml.on('zoomstart', cancelPress);
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
      cancelPress();
      ml.off('mousedown', onDown);
      ml.off('touchstart', onDown);
      ml.off('mousemove', onPressMove);
      ml.off('touchmove', onPressMove);
      ml.off('mouseup', cancelPress);
      ml.off('touchend', onTouchEnd);
      ml.off('touchcancel', cancelPress);
      ml.off('dragstart', cancelPress);
      ml.off('zoomstart', cancelPress);
      ml.off('click', onClick);
      ml.off('mousemove', onMove);
      ml.off('mouseout', onLeave);
      ml.off('movestart', onLeave);
      if (raf) cancelAnimationFrame(raf);
      entries.clear();
    },
  };
}
