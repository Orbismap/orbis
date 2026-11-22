// MapEngine on MapLibre GL JS 6. Everything outside map/ and render/ talks to this, not to MapLibre.
import * as maplibregl from 'maplibre-gl';
import type { CustomLayerInterface, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { effect } from '@preact/signals';
import { throttle } from '../core/scheduler';
import { buildingsChannel } from '../ext/channels';
import { closeKarteDetail } from '../state/hud';
import { routePick } from '../state/routes';
import { clearSelection, selectPlace, setProbe } from '../state/selection';
import { isMobile } from '../state/ui';
import { activeBasemap as activeBasemapSignal, buildings3d, buildingColour, buildingsReplaced, camera, mapDark, karteMode, padding, projection as projectionSignal, viewport, type CameraState, type Padding } from '../state/view';
import { BASEMAPS, BASEMAP_IDS, DEFAULT_BASEMAP, isStaticBasemap, GENERIC_BUILDINGS_ID, buildingColourOf, HILLSHADE_LAYER, HILLSHADE_STRENGTH, TERRAIN_EXAGGERATION, TERRAIN_SOURCE, composeStyle, hasOwnBuildings, hasTiles3d, isAerial, showsRelief, skyFor } from './basemaps';
import { registerDemTiles } from './dem-protocol';
import { registerKeyedTiles } from './basemaps/keyed-protocol';
import { registerPmtilesProtocol } from './pmtiles-protocol';
import { LABEL_VARIANTS, labelLayers } from './basemaps/vector';
import { activeMembers, loadRegional, memberIds, membersOf, regionalDef, regionalEntry, regionalReady, type Bounds } from './basemaps/regional';
import { clampCamera, ENGINE_MAX_PITCH, flyToTarget, locate as locateImpl } from './camera';
import { attachCameraLimits } from './limits';
import { pokeCameraFrame } from './frame';
import { createPicking } from './picking';
import { beforeIdFor } from './slots';
import { createTerminator } from './terminator';
import { installBuildingsTilt, tiltFactor, useDetailedBuildingTiles } from './buildings-tilt';
import { installGlobeTerrainFix } from './globe-terrain-fix';
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
  /** Terrain and 2.5D buildings follow the mode of the picker (Daten: off; Erkunden: on) and are always on for aerial images. (On those at true scale and only as the camera's height reference: the 3D tiles are laid over it, see StagePart.coversMap.) */
  const reliefOn = () => showsRelief(karteMode.peek(), basemap);
  registerDemTiles();
  registerKeyedTiles();
  registerPmtilesProtocol(); // the Orbis Karte overlay (PMTiles) is part of the basemap style

  buildings3d.value = true;
  activeBasemapSignal.value = basemap;

  // a URL/state asking for more tilt than the zoom allows is clamped on load
  const cam = clampCamera(camera.peek());
  const ml = new maplibregl.Map({
    container,
    style: composeStyle({ basemap, labels, terminator: terminatorMode === 'auto', projection: projectionSignal.peek(), buildings: buildings3d.peek() && reliefOn() }),
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
  const disposeGlobeTerrainFix = installGlobeTerrainFix(ml);
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
      if (at) (clearSelection(), closeKarteDetail());
      else setProbe(null);
    },
    (at) => {
      if (!isMobile.peek()) setProbe(at);
    },
  );

  const resolveReady = () => {
    loaded = true;
    useDetailedBuildingTiles(ml);
    if (ml.getProjection()?.type !== projectionSignal.peek()) ml.setProjection({ type: projectionSignal.peek() });
    applyBasemap();
    terminator.setMode(terminatorMode);
    writeCamera();
  };
  const ready = new Promise<void>((resolve) => {
    const finish = () => { try { resolveReady(); } catch (e) { console.error('ready resolveReady error', e); } resolve(); };
    if (ml.isStyleLoaded()) { finish(); return; }
    let done = false;
    const wrap = () => { if (done) return; done = true; finish(); };
    ml.once('style.load', wrap);
    ml.once('load', wrap);
    // fallback: poll
    const iv = setInterval(() => { if (ml.isStyleLoaded()) { clearInterval(iv); wrap(); } }, 100);
    setTimeout(() => { clearInterval(iv); wrap(); }, 5000);
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
      buildings3d.value;
      buildingsReplaced.value;
      buildingsChannel.presented.value;
      karteMode.value;
      if (loaded) (applyBuildings(), applyTerrain());
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
  /**
   * Generated regional basemap currently added to the style: its background plus the member layers (editions of a
   * series, newest on top) that touch the view. Only the selected one exists; hundreds would bloat the style.
   */
  let dynamic: { id: string; members: Set<number> } | undefined;
  const dropDynamic = () => {
    if (!dynamic) return;
    const def = regionalDef(dynamic.id);
    for (const l of def?.layers ?? []) if (ml.getLayer(l.id)) ml.removeLayer(l.id);
    for (const id of Object.keys(def?.sources ?? {})) if (ml.getSource(id)) ml.removeSource(id);
    dynamic = undefined;
  };
  /** Adds the background and the members for the current view; removes members that left it (also on every moveend). */
  function syncDynamic(id: string | undefined) {
    if (dynamic && dynamic.id !== id) dropDynamic();
    const def = id ? regionalDef(id) : undefined;
    const entry = id ? regionalEntry(id) : undefined;
    if (!id || !def || !entry) return;
    if (!dynamic) {
      ml.addLayer({ ...def.layers[0]!, layout: { visibility: 'visible' } } as LayerSpecification, HILLSHADE_LAYER);
      dynamic = { id, members: new Set() };
    }
    const b = ml.getBounds();
    const want = activeMembers(entry, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] as Bounds);
    for (const idx of [...dynamic.members]) {
      if (want.includes(idx)) continue;
      const ids = memberIds(id, idx);
      if (ml.getLayer(ids.layer)) ml.removeLayer(ids.layer);
      if (ml.getSource(ids.source)) ml.removeSource(ids.source);
      dynamic.members.delete(idx);
    }
    // newest first: every new layer goes directly below its newer neighbour (the first one below the hillshade)
    let above = HILLSHADE_LAYER;
    for (const idx of want) {
      const ids = memberIds(id, idx);
      if (!dynamic.members.has(idx)) {
        if (!ml.getSource(ids.source)) ml.addSource(ids.source, def.sources[ids.source]!);
        const spec = def.layers.find((l) => l.id === ids.layer)!;
        ml.addLayer({ ...spec, layout: { ...(spec.layout ?? {}), visibility: 'visible' } } as LayerSpecification, above);
        dynamic.members.add(idx);
      }
      above = ids.layer;
    }
  }
  ml.on('moveend', () => {
    if (loaded && dynamic && membersOf(regionalEntry(dynamic.id)!).length > 1) syncDynamic(dynamic.id);
  });
  /** 2.5D buildings: the Orbis basemaps' own, or the generic ones elsewhere; off with the switch, and off on aerial images (the real 3D tiles belong there). */
  function applyBuildings() {
    const shown = isStaticBasemap(basemap) ? basemap : undefined;
    // with Orbis Pro the detailed buildings (roofs-source.ts) include the plain ones: while they are drawn, the 2.5D buildings step aside
    buildingColour.value = buildingColourOf(shown);
    const on = buildings3d.peek() && !buildingsReplaced.peek() && reliefOn() && !buildingsChannel.presented.peek();
    for (const id of BASEMAP_IDS) for (const l of BASEMAPS[id].topLayers ?? []) setVis(l.id, on && id === shown);
    setVis(GENERIC_BUILDINGS_ID, on && !hasOwnBuildings(shown) && !hasTiles3d(shown));
  }
  function applyBasemap() {
    const regional = isStaticBasemap(basemap) ? undefined : regionalDef(basemap);
    // regional data not loaded yet: show the default meanwhile and apply again when it is there
    if (!isStaticBasemap(basemap) && !regional && !regionalReady.peek()) void loadRegional().then(() => loaded && applyBasemap(), () => {});
    syncDynamic(regional?.id);
    const shown = isStaticBasemap(basemap) ? basemap : regional ? undefined : DEFAULT_BASEMAP;
    for (const id of BASEMAP_IDS) for (const l of BASEMAPS[id].layers) setVis(l.id, id === shown);
    applyBuildings();
    const look = regional ?? BASEMAPS[shown ?? DEFAULT_BASEMAP];
    mapDark.value = look.theme === 'dark';
    for (const v of LABEL_VARIANTS) for (const l of labelLayers(v)) setVis(l.id, labels && !look.ownLabels && v === look.labelVariant);
    container.style.background = look.background;
    ml.setSky(skyFor(look.theme));
    terminator.setLook(look.theme);
    applyTerrain();
  }
  // 3D terrain scales smoothly up and down (exaggeration tween). On the flat Orbis colours it exists only on the globe:
  // switching to the 2D map flattens it, and from there on the map stays without terrain.
  const TERRAIN_MS = 700;
  /** from here on the globe has turned into the flat map: no terrain on the Orbis colours */
  const TERRAIN_MAX_ZOOM_ORBIS = 12;
  /** Temporarily off: keeps the terrain at every zoom instead of fading it out from TERRAIN_MAX_ZOOM_ORBIS. Set true to restore. */
  const TERRAIN_ZOOM_FADE = false;
  let terrainGoal = -1;
  let shadeGoal = -1;
  let terrainNow = 0;
  let terrainRaf = 0;
  /** Relief shading of the flat Orbis colours: the same with 3D terrain and where the terrain is flattened (2D), off with the switch. */
  let shadeNow = 0;
  const SHADE_FLAT = 1;
  const shadeTarget = () => {
    if (!reliefOn() || !(basemap === 'orbis-dark' || basemap === 'orbis-light')) return 0;
    return terrainTarget() > 0 ? 1 : SHADE_FLAT;
  };
  /** The 3D tiles of the aerial images are true to scale (sea level, see tiles3d/geoid): no exaggeration under them, so the camera's height agrees with theirs. */
  const TILES_TERRAIN_EXAGGERATION = 1;
  /** The terrain without the tilt: what the basemap and the mode ask for. */
  const terrainBase = () => {
    const flatOrbis = basemap === 'orbis-dark' || basemap === 'orbis-light';
    return reliefOn() && !(flatOrbis && (projectionSignal.peek() !== 'globe' || (TERRAIN_ZOOM_FADE && ml.getZoom() >= TERRAIN_MAX_ZOOM_ORBIS))) ? (hasTiles3d(basemap) ? TILES_TERRAIN_EXAGGERATION : TERRAIN_EXAGGERATION) : 0;
  };
  /**
   * On the Erkunden map the terrain flattens seen from above, with the same share as the buildings (buildings-tilt.ts: 10 % at 0°, full from
   * 30°): the terrain follows the camera's tilt continuously (pitch events), so it moves smoothly. Aerial images stay true to scale.
   */
  const tiltK = () => (karteMode.peek() === 'erkunden' && !isAerial(basemap) ? tiltFactor(ml.getPitch()) : 1);
  const terrainTarget = () => terrainBase() * tiltK();
  /**
   * Changes the exaggeration of the running terrain in place. `map.setTerrain` would rebuild the whole terrain every
   * frame (tiles reload, the camera re-solves its centre against a half-loaded terrain), which makes the view jump up
   * and down. Here only the number changes, the camera follows the ground under the centre smoothly.
   */
  type TerrainInternals = { exaggeration: number; options: { exaggeration?: number }; coverage: { exaggeration: number } };
  function paintTerrain() {
    const t = (ml as unknown as { terrain: TerrainInternals | null }).terrain;
    if (terrainNow <= 0.001) {
      if (t) ml.setTerrain(null);
    } else if (!t) {
      ml.setTerrain({ source: TERRAIN_SOURCE, exaggeration: terrainNow });
    } else if (t.coverage) {
      t.exaggeration = terrainNow;
      t.options.exaggeration = terrainNow;
      t.coverage.exaggeration = terrainNow;
      (ml as unknown as { _camera?: { applyTerrainChange?: () => void } })._camera?.applyTerrainChange?.();
      ml.triggerRepaint();
    } else ml.setTerrain({ source: TERRAIN_SOURCE, exaggeration: terrainNow });
    setVis(HILLSHADE_LAYER, shadeNow > 0.001);
    if (ml.getLayer(HILLSHADE_LAYER)) ml.setPaintProperty(HILLSHADE_LAYER, 'hillshade-exaggeration', HILLSHADE_STRENGTH * shadeNow);
  }
  /** the terrain without the tilt that the last tween went to; and whether a tween is running */
  let terrainBaseGoal = -1;
  let tweening = false;
  function applyTerrain() {
    const base = terrainBase();
    const to = base * tiltK();
    const shadeTo = shadeTarget();
    // only the tilt changed: follow it at once (the pitch changes smoothly itself), no tween
    if (base === terrainBaseGoal && !tweening) {
      if (to !== terrainGoal || shadeTo !== shadeGoal) {
        terrainGoal = to;
        shadeGoal = shadeTo;
        terrainNow = to;
        shadeNow = shadeTo;
        paintTerrain();
      }
      return;
    }
    if (to === terrainGoal && shadeTo === shadeGoal) return;
    terrainBaseGoal = base;
    tweening = true;
    terrainGoal = to;
    shadeGoal = shadeTo;
    cancelAnimationFrame(terrainRaf);
    const from = terrainNow;
    const shadeFrom = shadeNow;
    if (from === to && shadeFrom === shadeTo) return paintTerrain();
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / TERRAIN_MS);
      const e = 1 - Math.pow(1 - k, 3);
      terrainNow = from + (to - from) * e;
      shadeNow = shadeFrom + (shadeTo - shadeFrom) * e;
      paintTerrain();
      if (k < 1) terrainRaf = requestAnimationFrame(step);
      else { tweening = false; applyTerrain(); }
    };
    terrainRaf = requestAnimationFrame(step);
  }
  ml.on('zoom', () => loaded && applyTerrain());
  ml.on('pitch', () => loaded && applyTerrain());

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
      activeBasemapSignal.value = id;
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
      engine.flyTo({ center: [pos.lng, pos.lat], zoom: Math.max(ml.getZoom(), pos.accuracy > 2000 ? 9 : 14) });
      return pos;
    },
    destroy() {
      disposers.forEach((d) => d());
      limits.destroy();
      writeThrottled.cancel();
      terminator.destroy();
      picking.destroy();
      disposeBuildingsTilt();
      disposeGlobeTerrainFix();
      cancelAnimationFrame(terrainRaf);
      ml.remove();
      if (current === engine) current = undefined;
    },
  };
  current = engine;
  return engine;
}
