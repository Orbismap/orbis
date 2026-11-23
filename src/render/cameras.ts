// cameraLayer: one look for every layer that shows cameras (webcams, surveillance, licence plate readers, speed cameras).
// Small dots from the world view on, growing gently with zoom, dark halo, hover, selection ring; from zoom 12 on every
// dot carries a camera glyph and, where the data has a bearing, a viewing cone. Only the layer colour differs.
//
// A layer hands over its data as `sources`: each one is a PMTiles archive or a GeoJSON signal, drawn with the same style.
// `overview` is a decorative source (no card) for the world view; `detail` sources carry the cards.
import { computed, effect, signal, type ReadonlySignal } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification, LayerSpecification } from 'maplibre-gl';
import type { Resource } from '../data/resource';
import { bucketUrl } from '../data/endpoints';
import type { OsmUrl } from '../data/osmfiles';
import { formatInt } from '../core/format';
import type { InspectCard, LayerContext, LayerHandle, LayerStatus } from '../layers/types';
import { ensurePmtilesProtocol } from '../map/pmtiles-protocol';
import type { SlotId } from '../map/types';
import {
  Cleanup, DARK_HALO, EMPTY_FC, HOVER, LIMB, createLookup, dataSignal, ensureIds, idBase, mapOutputs,
  type AnyFeature, type Expr, type FeatureData,
} from './common';
import { ensureIcons } from './icons';
import { hoverScale, ringFilter } from './pointstyle';

export type CameraData =
  /**
   * `lowLayer`: attribute-free low-zoom layer of the file (osm-tiles.mjs of the data repo: `<sourceLayer>_lo`, one bare point per
   * 1024-grid cell of a tile, zooms 0 .. lowEnd - 1; the full layer starts at lowEnd). Default `<sourceLayer>_lo` with lowEnd 6,
   * false to switch off. Files built before it simply lack the layer (the full layer then still draws everything).
   */
  | { kind: 'pmtiles'; url: OsmUrl; sourceLayer: string; attribution?: string; lowLayer?: string | false; lowEnd?: number }
  | { kind: 'geojson'; data: FeatureData };

export interface CameraSource {
  /** Suffix of the map layer ids, unique within the layer. */
  name: string;
  data: CameraData;
  /** First zoom this source is drawn at, default 0 (world view). */
  minZoom?: number;
  /** Last zoom this source is drawn at (exclusive), default: always. For decorative sources whose rounded positions would show up as duplicates. */
  maxZoom?: number;
  /** Card of one object. Without it the source is decorative: no hover, no picking, no glyph. */
  describe?(feature: AnyFeature): InspectCard;
  /** Dot and cone color of this source, default the layer color. */
  color?: string;
  /** Property with a unique id (hover, selection), default 'id'. */
  idKey?: string;
  /** Property with the viewing direction in degrees clockwise from north (missing or negative: unknown), default 'dir'. */
  dirKey?: string;
}

export interface CameraLayerOptions {
  /** The only thing that differs between camera layers. */
  color: string;
  /** World-view dots without cards (e.g. a positions list), drawn below the detail sources. */
  overview?: CameraSource;
  detail: CameraSource | CameraSource[];
  /** Reported object count (undefined while unknown). */
  count?: ReadonlySignal<number | undefined>;
  /** Resources the layer cannot work without: loading/error state and age are reported from them. */
  resources?: Resource<unknown>[];
  /** Resources that only supply count and age; their errors are ignored. */
  softResources?: Resource<unknown>[];
  slot?: SlotId;
}

/** Dot radius in px by zoom: visible from the world view, grows gently, large enough to hold the glyph from zoom 12. */
export const CAMERA_RADIUS = ['interpolate', ['linear'], ['zoom'], 0, 1.4, 3, 1.9, 6, 2.7, 9, 3.8, 12, 6.2, 15, 8.8, 18, 11] as unknown as Expr;
/** Zoom from which glyph and viewing cone appear. */
export const CAMERA_DETAIL_ZOOM = 12;
const GLYPH_COLOR = '#0B1220';

/** Card helpers shared by all camera layers, so that cards read alike. */
const COMPASS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
export const directionFact = (dir: unknown): { label: string; value: string }[] => {
  const d = Number(dir);
  if (dir === null || dir === undefined || dir === '' || !Number.isFinite(d) || d < 0) return [];
  return [{ label: 'Blickrichtung', value: `${formatInt(d)}° (${COMPASS[Math.round((((d % 360) + 360) % 360) / 45) % 8]})` }];
};
export const osmNodeLink = (id: unknown): { label: string; url: string }[] => (id ? [{ label: 'OpenStreetMap', url: `https://www.openstreetmap.org/node/${id}` }] : []);

/** Object count and age of an OSM PMTiles set from the bucket's meta.json (1.4 KB). */
export function osmSetCount(ctx: LayerContext, set: string): { count: ReadonlySignal<number | undefined>; resource: Resource<unknown> } {
  const resource = ctx.resource<Record<string, { features?: number }>>({
    key: 'osm:meta', url: bucketUrl('osm', 'meta.json'), timeout: 20_000,
    parse: (raw) => ((raw as { sets?: Record<string, { features?: number }> } | null)?.sets ?? {}),
  });
  const count = computed(() => resource.data.value?.[set]?.features);
  return { count, resource };
}

const sourceId = (base: string, s: CameraSource) => `${base}.${s.name}-src`;

export function cameraLayer(ctx: LayerContext, o: CameraLayerOptions): LayerHandle {
  const engine = ctx.map;
  const ml = engine.ml;
  const base = idBase(ctx);
  const clean = new Cleanup();
  const slot = o.slot ?? 'points';
  const sources = [...(o.overview ? [o.overview] : []), ...(Array.isArray(o.detail) ? o.detail : [o.detail])];
  const addedLayers: string[] = [];
  const addedSources: string[] = [];
  let destroyed = false;

  // --- status
  const hard = o.resources ?? [];
  const all = [...hard, ...(o.softResources ?? [])];
  clean.add(effect(() => {
    const n = o.count?.value;
    const errs = hard.map((r) => r.error.value).filter(Boolean);
    all.forEach((r) => r.state.value);
    const stamps = all.map((r) => r.updatedAt.value).filter((v): v is number => v !== undefined);
    const updatedAt = stamps.length ? Math.min(...stamps) : undefined;
    let s: LayerStatus;
    if (hard.length && n === undefined) s = errs.length && hard.every((r) => r.state.value === 'error') ? { state: 'error', note: errs[0] } : { state: 'loading' };
    else s = { state: n === 0 ? 'empty' : 'ready', ...(n !== undefined ? { count: n } : {}), updatedAt, note: errs[0] };
    ctx.status(s);
  }));

  // --- paint, all numbers by zoom so that ctx.opacity can scale them
  const opacityNow = () => ctx.opacity.value;
  const zoomOpacity = (stops: [number, number][], k: number): Expr =>
    ['interpolate', ['linear'], ['zoom'], ...stops.flatMap(([z, v]) => [z, v * k])] as unknown as Expr;
  const DOT_OPACITY: [number, number][] = [[0, 0.78], [4, 0.88], [8, 0.95]];
  const STROKE_WIDTH: Expr = ['interpolate', ['linear'], ['zoom'], 0, 0, 3, 0.3, 7, 0.8, 12, 1.2] as unknown as Expr;
  const radius = mapOutputs(CAMERA_RADIUS, hoverScale) as unknown as ExpressionSpecification;

  // --- selection shared by all sources of the layer
  const selected = signal<{ src: string; id: unknown } | null>(null);
  let lastCard: InspectCard | null = null;
  clean.add(effect(() => { const c = ctx.selection.value; if (c !== lastCard && !ctx.ownSelection?.(c)) selected.value = null; }));

  /** the resolved PMTiles URLs (the dated file names come from the bucket's meta.json) */
  const urls = new Map<CameraSource, string>();

  function build() {
    ensureIcons(ml, ['camera', 'fov']);
    for (const s of sources) {
      const src = sourceId(base, s);
      const idKey = s.idKey ?? 'id';
      const dirKey = s.dirKey ?? 'dir';
      const picks = !!s.describe;
      const minzoom = { ...(s.minZoom ? { minzoom: s.minZoom } : {}), ...(s.maxZoom ? { maxzoom: s.maxZoom } : {}) };
      const detailZoom = Math.max(s.minZoom ?? 0, CAMERA_DETAIL_ZOOM);
      const sl = s.data.kind === 'pmtiles' ? { 'source-layer': s.data.sourceLayer } : {};
      const lowLayer = s.data.kind === 'pmtiles' && s.data.lowLayer !== false ? (s.data.lowLayer ?? `${s.data.sourceLayer}_lo`) : undefined;
      const lowEnd = s.data.kind === 'pmtiles' ? (s.data.lowEnd ?? 6) : 0;
      const lo = `${base}.${s.name}-lo`;

      if (s.data.kind === 'pmtiles') {
        engine.addSource(src, { type: 'vector', url: `pmtiles://${urls.get(s)}`, promoteId: idKey, ...(s.data.attribution ? { attribution: s.data.attribution } : {}) });
      } else {
        engine.addSource(src, { type: 'geojson', data: EMPTY_FC, promoteId: idKey });
      }
      addedSources.push(src);

      const hasDir: FilterSpecification = ['>=', ['to-number', ['get', dirKey], -1], 0];
      const fov = `${base}.${s.name}-fov`;
      const dots = `${base}.${s.name}-dots`;
      const glyph = `${base}.${s.name}-glyph`;
      const ring = `${base}.${s.name}-ring`;
      const specs: LayerSpecification[] = [];
      if (picks) {
        specs.push({
          id: fov, type: 'symbol', source: src, ...sl, minzoom: detailZoom, filter: hasDir,
          layout: {
            'icon-image': 'fov', 'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 1.3, 16, 2.2, 19, 3], 'icon-rotate': ['to-number', ['get', dirKey], 0],
            'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map',
          },
          paint: { 'icon-color': s.color ?? o.color, 'icon-opacity': 0.5 },
        } as LayerSpecification);
      }
      if (lowLayer) {
        // zoom < lowEnd: bare points (no ids, no cards); a click zooms in to where the full records load
        specs.push({
          id: lo, type: 'circle', source: src, 'source-layer': lowLayer, minzoom: s.minZoom ?? 0, maxzoom: lowEnd,
          paint: {
            'circle-radius': CAMERA_RADIUS as ExpressionSpecification,
            'circle-color': s.color ?? o.color,
            'circle-opacity': zoomOpacity(DOT_OPACITY, 1) as ExpressionSpecification,
            'circle-stroke-color': DARK_HALO as unknown as ExpressionSpecification,
            'circle-stroke-width': STROKE_WIDTH as ExpressionSpecification,
            'circle-stroke-opacity': 1,
            'circle-pitch-alignment': 'map',
            'circle-pitch-scale': 'map',
          },
        } as LayerSpecification);
      }
      specs.push({
        id: dots, type: 'circle', source: src, ...sl, ...minzoom,
        paint: {
          'circle-radius': picks ? radius : (CAMERA_RADIUS as ExpressionSpecification),
          'circle-color': s.color ?? o.color,
          'circle-opacity': zoomOpacity(DOT_OPACITY, 1) as ExpressionSpecification,
          'circle-stroke-color': (picks ? ['case', HOVER, '#ffffff', DARK_HALO] : DARK_HALO) as ExpressionSpecification,
          'circle-stroke-width': STROKE_WIDTH as ExpressionSpecification,
          'circle-stroke-opacity': 1,
          'circle-pitch-alignment': 'map',
          'circle-pitch-scale': 'map',
        },
      } as LayerSpecification);
      if (picks) {
        specs.push({
          id: glyph, type: 'symbol', source: src, ...sl, minzoom: detailZoom,
          layout: {
            'icon-image': 'camera', 'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.2, 15, 0.29, 18, 0.36],
            'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotation-alignment': 'viewport', 'icon-pitch-alignment': 'viewport',
          },
          paint: { 'icon-color': GLYPH_COLOR, 'icon-opacity': 0.9 },
        } as LayerSpecification);
        specs.push({
          id: ring, type: 'circle', source: src, ...sl, ...minzoom,
          filter: ringFilter(idKey, null),
          paint: {
            'circle-radius': mapOutputs(CAMERA_RADIUS, (e) => ['+', e, 5] as Expr) as ExpressionSpecification,
            'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': LIMB, 'circle-stroke-width': 2, 'circle-pitch-alignment': 'map', 'circle-pitch-scale': 'map',
          },
        } as LayerSpecification);
      }
      for (const l of specs) { engine.addLayer(l, slot); addedLayers.push(l.id); }

      // geojson data -> source
      if (s.data.kind === 'geojson') {
        const data = dataSignal(s.data.data);
        clean.add(effect(() => {
          const fc = data.value;
          (ml.getSource(src) as { setData(d: unknown): void } | undefined)?.setData(fc ? ensureIds(fc, idKey) : EMPTY_FC);
        }));
      }

      if (lowLayer && picks) {
        clean.add(engine.onPick([lo], {
          click(f) {
            if (f.geometry.type === 'Point') ml.easeTo({ center: f.geometry.coordinates.slice(0, 2) as [number, number], zoom: Math.max(ml.getZoom() + 2, lowEnd + 0.5), duration: 600 });
          },
        }));
      }

      if (picks) {
        // selection ring follows the inspector
        clean.add(effect(() => { const sel = selected.value; if (ml.getLayer(ring)) ml.setFilter(ring, ringFilter(idKey, sel && sel.src === src ? sel.id : null)); }));
        const lookup = createLookup(idKey);
        const geo = s.data.kind === 'geojson' ? dataSignal(s.data.data) : undefined;
        clean.add(engine.onPick([dots], {
          click(f) {
            const id = (f.properties as Record<string, unknown> | null)?.[idKey] ?? f.id;
            const full = (geo ? lookup(geo.peek(), id) : undefined) ?? f;
            const card: InspectCard = { icon: 'camera', ...s.describe!(full as AnyFeature), color: s.color ?? o.color };
            if (!card.location && f.geometry.type === 'Point') card.location = f.geometry.coordinates.slice(0, 2) as [number, number];
            lastCard = card;
            selected.value = { src, id };
            ctx.select(card);
          },
        }));
      }
    }

    // ctx.opacity scales every paint opacity of the layer
    clean.add(effect(() => {
      const k = opacityNow();
      for (const s of sources) {
        const b = `${base}.${s.name}`;
        const set = (id: string, prop: string, v: unknown) => { if (ml.getLayer(id)) ml.setPaintProperty(id, prop as 'circle-opacity', v as number); };
        set(`${b}-lo`, 'circle-opacity', zoomOpacity(DOT_OPACITY, k));
        set(`${b}-lo`, 'circle-stroke-opacity', k);
        set(`${b}-dots`, 'circle-opacity', zoomOpacity(DOT_OPACITY, k));
        set(`${b}-dots`, 'circle-stroke-opacity', k);
        set(`${b}-fov`, 'icon-opacity', 0.5 * k);
        set(`${b}-glyph`, 'icon-opacity', 0.9 * k);
        set(`${b}-ring`, 'circle-stroke-opacity', k);
      }
    }));
  }

  // PMTiles needs its protocol registered first (library loads on demand); everything is added in one go to keep the order
  const needsProtocol = sources.some((s) => s.data.kind === 'pmtiles');
  void Promise.all([
    needsProtocol ? ensurePmtilesProtocol() : undefined,
    ...sources.map(async (s) => { if (s.data.kind === 'pmtiles') urls.set(s, await s.data.url); }),
  ])
    .then(() => { if (!destroyed && !ctx.signal.aborted) build(); })
    .catch(() => ctx.status({ state: 'error', note: 'Kartenkacheln nicht ladbar' }));

  return {
    destroy() {
      destroyed = true;
      clean.run();
      engine.remove({ layers: [...addedLayers].reverse(), sources: addedSources });
    },
  };
}
