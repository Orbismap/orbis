// MapEngine on MapLibre GL JS 6. Everything outside map/ and render/ talks to this, not to MapLibre.
import * as maplibregl from 'maplibre-gl';
import type { CustomLayerInterface, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { effect } from '@preact/signals';
import { throttle } from '../core/scheduler';
import { collapseKarteDetail } from '../state/hud';
import { routePick } from '../state/routes';
import { clearSelection, selectPlace, setProbe } from '../state/selection';
import { isMobile } from '../state/ui';
import { camera, padding, projection as projectionSignal, terrain3d, viewport, type CameraState, type Padding } from '../state/view';
import { BASEMAPS, BASEMAP_IDS, DEFAULT_BASEMAP, HILLSHADE_LAYER, HILLSHADE_STRENGTH, TERRAIN_EXAGGERATION, TERRAIN_SOURCE, composeStyle, skyFor } from './basemaps';
import { registerDemTiles } from './dem-protocol';
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

const LABEL_KIND: Record<string, { text: string; zoom: number }> = {
  water: { text: 'Gewässer', zoom: 5 }, town: { text: 'Ort', zoom: 12 }, suburb: { text: 'Stadtteil', zoom: 14 }, road: { text: 'Straße', zoom: 15 },
  city: { text: 'Stadt', zoom: 11 }, state: { text: 'Region', zoom: 7 }, country: { text: 'Land', zoom: 5 },
};

/** The basemap label (city, country, water ...) under a pixel, if any. */
function labelAt(ml: maplibregl.Map, at: { lng: number; lat: number }): { title: string; lng: number; lat: number; category: string; zoom: number } | undefined {
  const layers = (ml.getStyle()?.layers ?? []).filter((l) => l.type === 'symbol' && l.id.startsWith('lbl-')).map((l) => l.id);
  if (!layers.length) return undefined;
  const p = ml.project([at.lng, at.lat]);
  const f = ml.queryRenderedFeatures([[p.x - 10, p.y - 8], [p.x + 10, p.y + 8]], { layers })[0];
  if (!f) return undefined;
  const pr = f.properties as Record<string, unknown>;
  const title = [pr['name:de'], pr.name_de, pr['name:latin'], pr.name].find((v): v is string => typeof v === 'string' && v.length > 0);
  if (!title) return undefined;
  const kind = LABEL_KIND[/^lbl-[a-z]+-(country|[a-z]+)/.exec(f.layer.id)?.[1] ?? ''] ?? { text: '', zoom: 10 };
  const [lng, lat] = f.geometry.type === 'Point' ? (f.geometry.coordinates as [number, number]) : [at.lng, at.lat];
  return { title, lng, lat, category: kind.text, zoom: kind.zoom };
}

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
  let terrainOn = true;
  registerDemTiles();

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
  // Desktop: a plain click on empty map closes the detail menu (selection and Karte menu, layers stay on); the point
  // query needs a 1 s press. Mobile keeps tap-to-query.
  const picking = createPicking(
    ml,
    (at) => {
      if (isMobile.peek()) return setProbe(at);
      const lbl = at && !isMobile.peek() ? labelAt(ml, at) : undefined;
      if (at && routePick(lbl ?? at, lbl?.title)) return;
      if (lbl) {
        selectPlace({ id: `lbl:${lbl.lng.toFixed(4)},${lbl.lat.toFixed(4)}`, title: lbl.title, subtitle: '', lng: lbl.lng, lat: lbl.lat, category: lbl.category || undefined });
        engine.flyTo({ center: [lbl.lng, lbl.lat], zoom: Math.max(ml.getZoom(), lbl.zoom) });
        return;
      }
      if (at) (clearSelection(), collapseKarteDetail());
      else setProbe(null);
    },
    (at) => {
      if (!isMobile.peek()) setProbe(at);
    },
  );

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
      terrainOn = terrain3d.value;
      if (loaded) applyTerrain();
    }),
    effect(() => {
      const p = projectionSignal.value;
      if (loaded && ml.getProjection()?.type !== p) ml.setProjection({ type: p });
      if (loaded) applyTerrain();
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
    applyTerrain();
  }
  // 3D terrain scales smoothly up and down (exaggeration tween). On the flat Orbis colours it exists only on the globe:
  // switching to the 2D map flattens it, and from there on the map stays without terrain.
  const TERRAIN_MS = 700;
  /** from here on the globe has turned into the flat map: no terrain on the Orbis colours */
  const TERRAIN_MAX_ZOOM_ORBIS = 12;
  let terrainGoal = -1;
  let terrainNow = 0;
  let terrainRaf = 0;
  const terrainTarget = () => {
    const flatOrbis = basemap === 'orbis-dark' || basemap === 'orbis-light';
    return terrainOn && !(flatOrbis && (projectionSignal.peek() !== 'globe' || ml.getZoom() >= TERRAIN_MAX_ZOOM_ORBIS)) ? TERRAIN_EXAGGERATION : 0;
  };
  function paintTerrain() {
    if (terrainNow > 0.001) {
      ml.setTerrain({ source: TERRAIN_SOURCE, exaggeration: terrainNow });
    } else if (ml.getTerrain()) ml.setTerrain(null);
    const flatOrbis = basemap === 'orbis-dark' || basemap === 'orbis-light';
    setVis(HILLSHADE_LAYER, terrainNow > 0.001 && flatOrbis);
    if (ml.getLayer(HILLSHADE_LAYER)) ml.setPaintProperty(HILLSHADE_LAYER, 'hillshade-exaggeration', HILLSHADE_STRENGTH * (terrainNow / TERRAIN_EXAGGERATION));
  }
  function applyTerrain() {
    const to = terrainTarget();
    if (to === terrainGoal) return;
    terrainGoal = to;
    cancelAnimationFrame(terrainRaf);
    const from = terrainNow;
    if (from === to) return paintTerrain();
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / TERRAIN_MS);
      terrainNow = from + (to - from) * (1 - Math.pow(1 - k, 3));
      paintTerrain();
      if (k < 1) terrainRaf = requestAnimationFrame(step);
    };
    terrainRaf = requestAnimationFrame(step);
  }
  ml.on('zoom', () => loaded && applyTerrain());

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
    setTerrain(on) {
      terrainOn = on;
      if (loaded) applyTerrain();
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
      cancelAnimationFrame(terrainRaf);
      ml.remove();
      if (current === engine) current = undefined;
    },
  };
  current = engine;
  return engine;
}
