// MapEngine on MapLibre GL JS 6. Everything outside map/ and render/ talks to this, not to MapLibre.
import * as maplibregl from 'maplibre-gl';
import type { CustomLayerInterface, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { effect } from '@preact/signals';
import { throttle } from '../core/scheduler';
import { setProbe } from '../state/selection';
import { camera, padding, projection as projectionSignal, viewport, type CameraState, type Padding } from '../state/view';
import { BASEMAPS, BASEMAP_IDS, DEFAULT_BASEMAP, composeStyle, skyFor } from './basemaps';
import { LABEL_VARIANTS, labelLayers } from './basemaps/vector';
import { clampCamera, ENGINE_MAX_PITCH, flyToTarget, locate as locateImpl } from './camera';
import { attachCameraLimits } from './limits';
import { pokeCameraFrame } from './frame';
import { createPicking } from './picking';
import { beforeIdFor } from './slots';
import { createTerminator } from './terminator';
import { installBuildingsTilt } from './buildings-tilt';
import type { BasemapId, CameraTarget, MapEngine, PickHandler, SlotId } from './types';

// MapLibre 6 ships its worker as a separate module; let Vite bundle it (with its shared chunk) and point MapLibre at it.
maplibregl.setWorkerUrl(workerUrl);

export interface EngineInit {
  basemap?: BasemapId;
  labels?: boolean;
  terminator?: boolean;
}

const EPS = { pos: 1e-6, zoom: 1e-4, angle: 1e-3 };
const differs = (a: CameraState, b: CameraState) =>
  Math.abs(a.lng - b.lng) > EPS.pos || Math.abs(a.lat - b.lat) > EPS.pos || Math.abs(a.zoom - b.zoom) > EPS.zoom ||
  Math.abs(a.bearing - b.bearing) > EPS.angle || Math.abs(a.pitch - b.pitch) > EPS.angle;

/** The most recently created engine (test hook, debugging). */
let current: (MapEngine & { destroy(): void }) | undefined;
export const getEngine = () => current;

export function createMapEngine(container: HTMLElement, init: EngineInit = {}): MapEngine & { destroy(): void } {
  let basemap: BasemapId = init.basemap ?? DEFAULT_BASEMAP;
  let labels = init.labels ?? true;
  let terminatorMode: 'off' | 'auto' = init.terminator === false ? 'off' : 'auto';
  let loaded = false;

  // a URL/state asking for more tilt than the zoom allows is clamped on load
  const cam = clampCamera(camera.peek());
  const ml = new maplibregl.Map({
    container,
    style: composeStyle({ basemap, labels, terminator: terminatorMode === 'auto', projection: projectionSignal.peek() }),
    center: [cam.lng, cam.lat],
    zoom: cam.zoom,
    bearing: cam.bearing,
    pitch: cam.pitch,
    attributionControl: false,
    maxPitch: ENGINE_MAX_PITCH,
    minZoom: 0.5,
    maxZoom: 19,
    fadeDuration: 150,
    dragRotate: true,
    pitchWithRotate: true,
    renderWorldCopies: true,
  });
  ml.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  if (import.meta.env?.DEV) ml.on('error', (e) => console.warn('[map]', e.error?.message ?? e));

  const disposeBuildingsTilt = installBuildingsTilt(ml);
  const terminator = createTerminator(ml);
  const picking = createPicking(ml, setProbe);

  const ready = new Promise<void>((resolve) => {
    ml.once('style.load', () => {
      loaded = true;
      if (ml.getProjection()?.type !== projectionSignal.peek()) ml.setProjection({ type: projectionSignal.peek() });
      applyBasemap();
      terminator.setMode(terminatorMode);
      writeCamera();
      resolve();
    });
  });

  // ---- camera <-> state/view ------------------------------------------------
  let lastWritten: unknown = camera.peek();
  const readCamera = (): CameraState => {
    const c = ml.getCenter();
    return { lng: c.lng, lat: c.lat, zoom: ml.getZoom(), bearing: ml.getBearing(), pitch: ml.getPitch() };
  };
  const writeCamera = () => {
    const next = readCamera();
    lastWritten = next;
    camera.value = next;
    const b = ml.getBounds();
    const el = ml.getCanvas();
    viewport.value = { bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], width: el.clientWidth, height: el.clientHeight };
  };
  const writeThrottled = throttle(writeCamera, 100);
  // attached before the camera listeners below, so the clamped values are the ones that get written
  const limits = attachCameraLimits(ml, () => (writeThrottled(), pokeCameraFrame(ml)));
  ml.on('move', writeThrottled);
  ml.on('moveend', () => writeThrottled.flush());

  const disposers = [
    effect(() => {
      const c = camera.value;
      if (c === lastWritten || !loaded) return;
      const want = clampCamera(c);
      limits.ensureFor(want.zoom);
      if (differs(want, readCamera())) ml.jumpTo({ center: [want.lng, want.lat], zoom: want.zoom, bearing: want.bearing, pitch: want.pitch });
      // asked for more than allowed: report what the map really shows
      if (want.pitch !== c.pitch || want.bearing !== c.bearing) writeCamera();
    }),
    effect(() => {
      const p = padding.value;
      ml.setPadding(p);
    }),
    effect(() => {
      const p = projectionSignal.value;
      if (loaded && ml.getProjection()?.type !== p) ml.setProjection({ type: p });
    }),
  ];

  // ---- basemap / labels -----------------------------------------------------
  const setVis = (id: string, on: boolean) => {
    if (!ml.getLayer(id)) return;
    const v = on ? 'visible' : 'none';
    if (ml.getLayoutProperty(id, 'visibility') !== v) ml.setLayoutProperty(id, 'visibility', v);
  };
  function applyBasemap() {
    for (const id of BASEMAP_IDS) for (const l of [...BASEMAPS[id].layers, ...(BASEMAPS[id].topLayers ?? [])]) setVis(l.id, id === basemap);
    const variant = BASEMAPS[basemap].labelVariant;
    for (const v of LABEL_VARIANTS) for (const l of labelLayers(v)) setVis(l.id, labels && v === variant);
    container.style.background = BASEMAPS[basemap].background;
    const theme = BASEMAPS[basemap].theme;
    ml.setSky(skyFor(theme));
    terminator.setLook(theme);
  }

  // ---- slots ----------------------------------------------------------------
  const place = (spec: LayerSpecification | CustomLayerInterface, slot: SlotId) => {
    if (ml.getLayer(spec.id)) return;
    ml.addLayer(spec as LayerSpecification, beforeIdFor(slot));
  };

  const engine: MapEngine & { destroy(): void } = {
    ml,
    ready,
    setBasemap(id) {
      if (id === basemap) return;
      basemap = id;
      if (loaded) applyBasemap();
    },
    setProjection(p) {
      projectionSignal.value = p;
    },
    setLabels(on) {
      labels = on;
      if (loaded) applyBasemap();
    },
    setTerminator(mode) {
      terminatorMode = mode;
      if (loaded) terminator.setMode(mode);
    },
    addSource(id: string, spec: SourceSpecification) {
      if (!ml.getSource(id)) ml.addSource(id, spec);
    },
    addLayer(spec, slot) {
      place(spec, slot);
    },
    addCustomLayer(layer, slot) {
      place(layer, slot);
    },
    remove({ layers = [], sources = [] }) {
      for (const id of layers) if (ml.getLayer(id)) ml.removeLayer(id);
      for (const id of sources) {
        try {
          if (ml.getSource(id)) ml.removeSource(id);
        } catch {
          /* still used by another layer */
        }
      }
    },
    onPick(layerIds: string[], h: PickHandler) {
      return picking.add(layerIds, h);
    },
    flyTo(target: CameraTarget) {
      flyToTarget(ml, target, padding.peek());
    },
    holdCamera: () => limits.hold(),
    requestRender() {
      ml.triggerRepaint();
    },
    moveToSlotTop(layerId, slot) {
      if (ml.getLayer(layerId)) ml.moveLayer(layerId, beforeIdFor(slot));
    },
    setPadding(p: Partial<Padding>) {
      padding.value = { ...padding.peek(), ...p };
    },
    getBasemap: () => basemap,
    async locate() {
      const pos = await locateImpl();
      engine.flyTo({ center: [pos.lng, pos.lat], zoom: Math.max(ml.getZoom(), pos.accuracy > 2000 ? 9 : 12) });
      return pos;
    },
    destroy() {
      disposers.forEach((d) => d());
      limits.destroy();
      writeThrottled.cancel();
      terminator.destroy();
      picking.destroy();
      disposeBuildingsTilt();
      ml.remove();
      if (current === engine) current = undefined;
    },
  };
  current = engine;
  return engine;
}
