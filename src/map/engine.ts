// MapEngine on MapLibre GL JS 6. Everything outside map/ and render/ talks to this, not to MapLibre.
import * as maplibregl from 'maplibre-gl';
import type { CustomLayerInterface, ExpressionSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { effect } from '@preact/signals';
import { throttle } from '../core/scheduler';
import { buildingsChannel } from '../ext/channels';
import { closeKarteDetail } from '../state/hud';
import { routePick } from '../state/routes';
import { clearSelection, selectPlace, setProbe } from '../state/selection';
import { isMobile } from '../state/ui';
import { activeBasemap as activeBasemapSignal, buildings3d, poiBasemap, poiLayerOn, poiLabelsVisible, buildingColour, buildingsColoured, buildingsLayerOn, buildingsPlainWanted, buildingsReplaced, camera, mapDark, karteMode, padding, replayLook, projection as projectionSignal, sheetCover, terrainLayerOn, viewport, type CameraState, type Padding } from '../state/view';
import { BASEMAPS, BASEMAP_IDS, DEFAULT_BASEMAP, isStaticBasemap, GENERIC_BUILDINGS_ID, buildingColourOf, HILLSHADE_LAYER, HILLSHADE_STRENGTH, TERRAIN_EXAGGERATION, TERRAIN_SOURCE, composeStyle, hasOwnBuildings, hasTiles3d, isAerial, showsRelief, skyFor } from './basemaps';
import { registerDemTiles } from './dem-protocol';
import { reliefRange } from './relief';
import { registerKeyedTiles } from './basemaps/keyed-protocol';
import { seasonLayerId } from './basemaps/raster';
import { seasonBlend, seasonPos } from '../state/season';
import { registerPmtilesProtocol } from './pmtiles-protocol';
import { LABEL_VARIANTS, labelLayers } from './basemaps/vector';
import { landmarkMask } from '../data/landmarks';
import { startPoiHeights, type PoiHeights } from './poi-heights';
import { POI_ICON_SPECS, POI_LAYER_ID, poiDotsId, poiFilter, poiKind, poiOccluded } from './poi';
import { ensureIcons } from '../render/icons';
import { ensurePoiIcons } from '../render/poi-icons';
import { activeMembers, loadRegional, memberIds, membersOf, regionalDef, regionalEntry, regionalReady, type Bounds } from './basemaps/regional';
import { clampCamera, ENGINE_MAX_PITCH, flyToTarget, locate as locateImpl } from './camera';
import { attachCameraLimits } from './limits';
import { pokeCameraFrame } from './frame';
import { createPicking } from './picking';
import { beforeIdFor } from './slots';
import { createTerminator } from './terminator';
import { applyBuildingZoom, installBuildingsTilt, tiltFactor, useDetailedBuildingTiles } from './buildings-tilt';
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
  /** A MapLibre map that already exists (the weather app's map card). It is taken over instead of creating a new one:
   *  the engine sets the Orbis style and interaction limits on it. `destroy()` removes it like its own map. */
  adopt?: maplibregl.Map;
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
  let poiHeights: PoiHeights | undefined;
  /** Terrain and 2.5D buildings follow the mode of the picker (Daten: off; Erkunden: on) and are always on for aerial images. (On those at true scale and only as the camera's height reference: the 3D tiles are laid over it, see StagePart.coversMap.) */
  const reliefOn = () => showsRelief(karteMode.peek(), basemap);
  /** Places of interest belong to the Erkunden map (not aerial images), unless the layer "Orte und Läden" draws them itself. */
  const poiWanted = () => karteMode.peek() === 'erkunden' && !isAerial(basemap) && poiBasemap.peek() && !poiLayerOn.peek();
  registerDemTiles();
  registerKeyedTiles();
  registerPmtilesProtocol(); // the Orbis Karte overlay (PMTiles) is part of the basemap style

  buildings3d.value = true;
  activeBasemapSignal.value = basemap;

  // a URL/state asking for more tilt than the zoom allows is clamped on load
  const cam = clampCamera(camera.peek());
  const style = composeStyle({ basemap, labels, terminator: terminatorMode === 'auto', projection: projectionSignal.peek(), buildings: buildings3d.peek() && reliefOn(), poi: poiWanted() });
  const ml = init.adopt ?? new maplibregl.Map({
    container,
    style,
    center: [cam.lng, cam.lat],
    zoom: cam.zoom,
    bearing: cam.bearing,
    pitch: cam.pitch,
    attributionControl: false,
    maxPitch: ENGINE_MAX_PITCH,
    minZoom: 0.5,
    maxZoom: 19,
    fadeDuration: 150,
    // tiles that leave the view stay in memory (default: what the viewport needs): turning around a point or a short pan back loads nothing again
    maxTileCacheSize: 300,
    dragRotate: true,
    pitchWithRotate: true,
    renderWorldCopies: true,
  });
  if (init.adopt) {
    // Same limits and gestures a fresh engine map starts with; the weather map had rotation and tilt switched off.
    ml.setMaxPitch(ENGINE_MAX_PITCH);
    ml.setMinZoom(0.5);
    ml.setMaxZoom(19);
    ml.dragRotate.enable();
    ml.touchPitch.enable();
    ml.touchZoomRotate.enableRotation();
    ml.setStyle(style);
    if (differs(cam, { lng: ml.getCenter().lng, lat: ml.getCenter().lat, zoom: ml.getZoom(), bearing: ml.getBearing(), pitch: ml.getPitch() })) {
      ml.jumpTo({ center: [cam.lng, cam.lat], zoom: cam.zoom, bearing: cam.bearing, pitch: cam.pitch });
    }
  } else {
    ml.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  }
  ensureIcons(ml);
  ensurePoiIcons(ml, POI_ICON_SPECS);
  if (import.meta.env?.DEV) ml.on('error', (e) => console.warn('[map]', e.error?.message ?? e));

  const disposeBuildingsTilt = installBuildingsTilt(ml);
  const disposeGlobeTerrainFix = installGlobeTerrainFix(ml);
  const terminator = createTerminator(ml);
  // A tap or click on a label selects the place, one on empty map deselects (and closes the Karte menu, layers stay on);
  // a long press drops a pin. While a route is planned, a tap sets a point of the route.
  const picking = createPicking(
    ml,
    (at) => {
      const lbl = at ? labelAt(ml, at) : undefined;
      if (at && routePick(lbl ?? at, lbl?.title)) return;
      if (lbl) {
        selectPlace({ id: `lbl:${lbl.lng.toFixed(4)},${lbl.lat.toFixed(4)}`, title: lbl.title, subtitle: '', lng: lbl.lng, lat: lbl.lat, category: lbl.category || undefined });
        // phones keep their zoom: features/shared/keep-visible.ts moves the map only if the sheet would cover the point
        if (!isMobile.peek()) engine.flyTo({ center: [lbl.lng, lbl.lat], zoom: Math.max(ml.getZoom(), lbl.zoom) });
        return;
      }
      if (at) (clearSelection(), closeKarteDetail());
      else setProbe(null);
    },
    (at) => setProbe(at),
  );
  // the places of the basemap and the badges of the 3D landmarks (pro, layer id of pro/landmarks/badges.ts) open the detail menu, like a searched place
  picking.add([POI_LAYER_ID, poiDotsId(POI_LAYER_ID), 'landmark-badges'], {
    click(f) {
      if (f.geometry.type !== 'Point') return;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const p = (f.properties ?? {}) as { name?: string; id?: string; class?: string; subclass?: string };
      const landmark = f.layer.id === 'landmark-badges';
      const kind = landmark ? 'Wahrzeichen' : poiKind(p);
      selectPlace({ id: `${landmark ? 'lm' : 'poi'}:${p.id ?? `${lng.toFixed(5)},${lat.toFixed(5)}`}`, title: String(p.name ?? kind), subtitle: kind, lng, lat, category: kind });
    },
  });

  const resolveReady = () => {
    loaded = true;
    void checkFlat();
    useDetailedBuildingTiles(ml);
    // places float at the roof of their building while the buildings stand (the same share of the height as the buildings)
    poiHeights = startPoiHeights(ml, {
      active: () => ml.getLayoutProperty(POI_LAYER_ID, 'visibility') === 'visible' || poiLayerOn.peek(),
      share: () => (buildings3d.peek() && reliefOn() && !isAerial(basemap) ? tiltFactor(ml.getPitch()) : 0),
    });
    if (ml.getProjection()?.type !== projectionSignal.peek()) ml.setProjection({ type: projectionSignal.peek() });
    applyBasemap();
    terminator.setMode(terminatorMode);
    writeCamera();
  };
  const ready = new Promise<void>((resolve) => {
    let done = false;
    let iv: ReturnType<typeof setInterval> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Everything resolveReady does (setProjection, applyBasemap, addLayer) needs a fully loaded style: getStyle() is
    // undefined until then, and resolving early made the layers and Pro mount against a half style (and left the
    // tilt height patch uninstalled, which draws the 2.5D houses at their raw z*H height at high zoom).
    function finish() {
      if (done || !ml.isStyleLoaded()) return;
      done = true;
      if (iv !== undefined) clearInterval(iv);
      if (timer !== undefined) clearTimeout(timer);
      ml.off('load', check);
      try { resolveReady(); } catch (e) { console.error('ready resolveReady error', e); }
      resolve();
    }
    function check() { if (ml.isStyleLoaded()) finish(); }
    // defer even when the style is already there: the rest of createMapEngine (terrain state, effects) must be set up first
    if (ml.isStyleLoaded()) { queueMicrotask(finish); return; }
    ml.on('load', check);
    iv = setInterval(check, 50);
    // last resort for a source that never loads: never resolve against a half style
    timer = setTimeout(() => { if (ml.isStyleLoaded()) finish(); else console.error('[map] style did not load in time'); }, 30_000);
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
      buildingsPlainWanted.value;
      buildingsLayerOn.value;
      buildingsColoured.value;
      buildingsChannel.presented.value;
      karteMode.value;
      terrainLayerOn.value;
      replayLook.value;
      if (loaded) (applyBuildings(), applyTerrain());
    }),
    effect(() => {
      const hide = landmarkMask.value.boxes;
      poiOccluded.value; // followed even before the map is ready
      if (!loaded) return;
      if (ml.getLayer(POI_LAYER_ID)) ml.setFilter(POI_LAYER_ID, poiFilter(undefined, 0, hide));
      if (ml.getLayer(poiDotsId(POI_LAYER_ID))) ml.setFilter(poiDotsId(POI_LAYER_ID), poiFilter(undefined, 0, hide));
    }),
    effect(() => {
      poiBasemap.value;
      poiLayerOn.value;
      karteMode.value;
      if (loaded) applyPoi();
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
  let lastBuildingPaint: string | undefined;
  /** 2.5D buildings: the Orbis basemaps' own, or the generic ones elsewhere; off with the switch, and off on aerial images (the real 3D tiles belong there). The layer's type "Gebäude" asks for them even where the Karte mode would hide them. */
  function applyBuildings() {
    const shown = isStaticBasemap(basemap) ? basemap : undefined;
    // with Orbis Pro the detailed buildings (roofs-source.ts) include the plain ones: while they are drawn, the 2.5D buildings step aside
    buildingColour.value = buildingColourOf(shown);
    const on = buildings3d.peek() && !buildingsReplaced.peek() && (reliefOn() || buildingsPlainWanted.peek()) && !buildingsChannel.presented.peek();
    for (const id of BASEMAP_IDS) for (const l of BASEMAPS[id].topLayers ?? []) setVis(l.id, on && id === shown);
    setVis(GENERIC_BUILDINGS_ID, on && !hasOwnBuildings(shown) && !hasTiles3d(shown));
    // while the layer is on, its "Eingefärbt" switch covers the basemap's 2.5D houses too: OSM colours when on, its plain colour when off
    const colour: string | ExpressionSpecification = buildingsLayerOn.peek() && buildingsColoured.peek()
      ? ['coalesce', ['get', 'colour'], buildingColour.value]
      : buildingColour.value;
    const paint = JSON.stringify(colour);
    if (paint !== lastBuildingPaint) {
      lastBuildingPaint = paint;
      for (const id of BASEMAP_IDS) for (const l of BASEMAPS[id].topLayers ?? []) if (ml.getLayer(l.id)) ml.setPaintProperty(l.id, 'fill-extrusion-color', colour);
      if (ml.getLayer(GENERIC_BUILDINGS_ID)) ml.setPaintProperty(GENERIC_BUILDINGS_ID, 'fill-extrusion-color', colour);
    }
    applyBuildingZoom(ml);
  }
  function applyPoi() {
    const look = isStaticBasemap(basemap) ? BASEMAPS[basemap] : undefined;
    const on = poiWanted() && labels && !look?.ownLabels;
    setVis(POI_LAYER_ID, on);
    setVis(poiDotsId(POI_LAYER_ID), on);
    // a landmark's own badge is a place label too: without POIs (e.g. the bare "Daten" map) the model stands alone
    poiLabelsVisible.value = on || poiLayerOn.peek();
    poiHeights?.refresh();
  }
  /** Basemap "Jahreszeiten": the two month images around the slider are blended (the lower one opaque, the upper one by its share); the neighbours load invisibly. */
  function applySeason() {
    if (basemap !== 'jahreszeiten') return;
    const { a, b, mix } = seasonBlend(seasonPos.peek());
    for (let m = 0; m < 12; m++) {
      const id = seasonLayerId(m);
      setVis(id, true); // all twelve stay visible at opacity 0: their tiles load at once and the slider never waits
      if (ml.getLayer(id)) ml.setPaintProperty(id, 'raster-opacity', 0);
    }
    const top = Math.max(a, b);
    const bottom = Math.min(a, b);
    if (mix < 0.002) return void ml.setPaintProperty(seasonLayerId(a), 'raster-opacity', 1);
    ml.setPaintProperty(seasonLayerId(bottom), 'raster-opacity', 1);
    ml.setPaintProperty(seasonLayerId(top), 'raster-opacity', top === b ? mix : 1 - mix);
  }
  const stopSeason = effect(() => {
    seasonPos.value;
    if (loaded) applySeason();
  });
  function applyBasemap() {
    const regional = isStaticBasemap(basemap) ? undefined : regionalDef(basemap);
    // regional data not loaded yet: show the default meanwhile and apply again when it is there
    if (!isStaticBasemap(basemap) && !regional && !regionalReady.peek()) void loadRegional().then(() => loaded && applyBasemap(), () => {});
    syncDynamic(regional?.id);
    const shown = isStaticBasemap(basemap) ? basemap : regional ? undefined : DEFAULT_BASEMAP;
    for (const id of BASEMAP_IDS) for (const l of BASEMAPS[id].layers) setVis(l.id, id === shown);
    applySeason();
    applyBuildings();
    applyPoi();
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
  /**
   * Flat ground (Berlin, the Netherlands): the 3D terrain costs every frame and shows nothing, so the Erkunden map leaves it off there.
   * Decided from the height range around the view (relief.ts) with a gap between the two limits so that it does not flip back and forth.
   * Only from this zoom on (further out the view covers regions, not a place) and never for aerial images or with the layer "Gelände".
   */
  const FLAT_BELOW_M = 50;
  const FLAT_ABOVE_M = 80;
  const FLAT_MIN_ZOOM = 11;
  let flatGround = false;
  let flatSeq = 0;
  const flatGateApplies = () => karteMode.peek() === 'erkunden' && !isAerial(basemap) && !terrainLayerOn.peek();
  async function checkFlat() {
    const seq = ++flatSeq;
    let flat = false;
    if (flatGateApplies() && ml.getZoom() >= FLAT_MIN_ZOOM) {
      const b = ml.getBounds(), c = ml.getCenter();
      const half = Math.min(0.25, Math.max(0.02, Math.max(b.getEast() - b.getWest(), b.getNorth() - b.getSouth()) / 2));
      const range = await reliefRange(c.lng, c.lat, half);
      if (seq !== flatSeq) return;
      if (range === undefined) return; // no data: keep what it was
      flat = flatGround ? range < FLAT_ABOVE_M : range < FLAT_BELOW_M;
    }
    if (flat !== flatGround) { flatGround = flat; if (loaded) applyTerrain(); }
  }
  ml.on('moveend', () => { if (loaded) void checkFlat(); });
  /** The terrain without the tilt: what the basemap and the mode ask for, or forced on by the layer "Gelände". */
  const terrainBase = () => {
    const exaggeration = hasTiles3d(basemap) ? TILES_TERRAIN_EXAGGERATION : TERRAIN_EXAGGERATION;
    if (replayLook.peek()) return 0;
    if (terrainLayerOn.peek()) return exaggeration;
    if (flatGround && flatGateApplies()) return 0;
    const flatOrbis = basemap === 'orbis-dark' || basemap === 'orbis-light';
    return reliefOn() && !(flatOrbis && (projectionSignal.peek() !== 'globe' || (TERRAIN_ZOOM_FADE && ml.getZoom() >= TERRAIN_MAX_ZOOM_ORBIS))) ? exaggeration : 0;
  };
  /**
   * On the Erkunden map the terrain flattens seen from above, with the same share as the buildings (buildings-tilt.ts: 10 % at 0°, full from
   * 30°): the terrain follows the camera's tilt continuously (pitch events), so it moves smoothly. Aerial images stay true to scale.
   */
  const tiltK = () => (terrainLayerOn.peek() || karteMode.peek() !== 'erkunden' || isAerial(basemap) ? 1 : tiltFactor(ml.getPitch()));
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
  ml.on('pitch', () => { if (!loaded) return; applyTerrain(); applyBuildingZoom(ml); });

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
      flyToTarget(ml, target, padding.peek(), sheetCover.peek());
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
      stopSeason();
      limits.destroy();
      poiHeights?.destroy();
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
