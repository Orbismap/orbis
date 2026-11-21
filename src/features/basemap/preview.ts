// Live miniatures of basemaps for the picker: one hidden MapLibre map renders them one after the other at the position, zoom, bearing,
// tilt and projection of the big map (scaled down, so a thumbnail shows the same area as a shrunken copy) and hands each result over as
// an image. One WebGL context; every miniature is rendered once per opening of the picker, and the map is gone when the picker closes.
import { signal } from '@preact/signals';
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import { BASEMAPS, TERRAIN_SOURCE, TERRAIN_SPEC } from '../../map/basemaps';
import { OFM_GLYPHS, OFM_SOURCE } from '../../map/basemaps/vector';
import { regionalDef } from '../../map/basemaps/regional';
import type { BasemapDef } from '../../map/basemaps';
import type { BasemapId } from '../../map/types';
import { camera, projection, viewport } from '../../state/view';

/** basemap id -> data URL of its miniature (missing until rendered) */
export const previewImages = signal<Partial<Record<string, string>>>({});

/** render size in px: 3:2, 2x of the largest thumbnail, so it stays sharp */
const W = 432;
const H = 288;

/** The definition to render: a static basemap as it is; a regional one with only its background and its newest layer (a series has up to dozens of editions). */
function previewDef(id: BasemapId): BasemapDef | undefined {
  if (Object.hasOwn(BASEMAPS, id)) return BASEMAPS[id as keyof typeof BASEMAPS];
  const d = regionalDef(id);
  if (!d || d.layers.length < 2) return d;
  const top = d.layers[d.layers.length - 1]!;
  const src = (top as { source?: string }).source;
  return { ...d, layers: [d.layers[0]!, top], sources: src && d.sources[src] ? { [src]: d.sources[src]! } : d.sources };
}

/** Just this basemap, visible, without labels and slots. */
function styleFor(id: BasemapId, proj: 'globe' | 'mercator'): StyleSpecification {
  const def = previewDef(id);
  if (!def) throw new Error(`no definition for ${id}`);
  return {
    version: 8,
    projection: { type: proj },
    glyphs: OFM_GLYPHS,
    sources: { ofm: OFM_SOURCE, [TERRAIN_SOURCE]: TERRAIN_SPEC, ...def.sources },
    layers: def.layers.map((l) => ({ ...l, layout: { ...(l.layout ?? {}), visibility: 'visible' } }) as StyleSpecification['layers'][number]),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Previews {
  /** Renders the miniatures that are not there yet; `first` puts them before the ones still waiting. */
  request(ids: readonly BasemapId[], first?: boolean): void;
  /** Stops and frees the maps. */
  dispose(): void;
}

/** Maps rendering at the same time: a slow tile server holds up one lane, not the whole queue. */
const LANES = 4;
/** A miniature is taken after this long even if tiles are missing (a partial picture beats none); it gets a second go at the end. */
const SOFT = 3500;
const HARD = 9000;

/** The view of the big map is read once, now; the picker shows a snapshot of it. */
export function createPreviews(): Previews {
  previewImages.value = {};
  const cam = camera.peek();
  const proj = projection.peek();
  // same area as the big map, shrunk: the thumbnail sits as many zoom steps below the camera as it is smaller than the viewport
  const zoom = Math.max(0, cam.zoom + Math.log2(H / Math.max(H, viewport.peek()?.height ?? 800)));
  let dead = false;
  let lanes = 0;
  let queue: BasemapId[] = [];
  /** the ones that were cut off at SOFT, for a second try when the queue is empty */
  let late: BasemapId[] = [];
  let second = false;
  const known = new Set<string>();
  const maps: { ml: maplibregl.Map; host: HTMLDivElement }[] = [];

  /** One lane: its own hidden map. Returns true when every tile of the picture had arrived. */
  const render = async (lane: { ml?: maplibregl.Map; host?: HTMLDivElement }, id: BasemapId, limit: number): Promise<boolean> => {
    if (!lane.ml) {
      const host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = `position:fixed;left:-10000px;top:0;width:${W}px;height:${H}px;pointer-events:none`;
      document.body.append(host);
      const ml = new maplibregl.Map({
        container: host, style: styleFor(id, proj), center: [cam.lng, cam.lat], zoom, bearing: cam.bearing, pitch: cam.pitch,
        interactive: false, attributionControl: false, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      lane.ml = ml;
      lane.host = host;
      maps.push({ ml, host });
    } else lane.ml.setStyle(styleFor(id, proj));
    const map = lane.ml;
    await sleep(100);
    const t0 = performance.now();
    let done = false;
    for (;;) {
      done = !!map.isStyleLoaded() && map.areTilesLoaded();
      if (dead || done || performance.now() - t0 >= limit) break;
      await sleep(60);
    }
    if (dead) return true;
    // the canvas holds the finished frame only inside a render event
    const url = await new Promise<string>((res) => {
      map.once('render', () => res(map.getCanvas().toDataURL('image/webp', 0.85)));
      map.triggerRepaint();
    });
    if (!dead) previewImages.value = { ...previewImages.peek(), [id]: url };
    return done;
  };

  const runLane = async () => {
    const lane: { ml?: maplibregl.Map; host?: HTMLDivElement } = {};
    lanes++;
    while (!dead) {
      if (!queue.length && late.length && !second) {
        // everything else is done: give the cut-off ones another, longer try
        second = true;
        queue = late;
        late = [];
      }
      const id = queue.shift();
      if (!id) break;
      try {
        const complete = await render(lane, id, second ? HARD : SOFT);
        if (!complete && !second) late.push(id);
      } catch { /* a failed miniature stays the plain colour of its basemap */ }
    }
    lanes--;
  };

  const pump = () => {
    while (!dead && lanes < LANES && lanes < queue.length) void runLane();
  };

  return {
    request(ids, first = false) {
      const fresh = ids.filter((id) => !known.has(id));
      for (const id of fresh) known.add(id);
      queue = first ? [...fresh, ...queue] : [...queue, ...fresh];
      second = false; // new work: the cut-off ones wait for the end again
      pump();
    },
    dispose() {
      dead = true;
      for (const m of maps) {
        m.ml.remove();
        m.host.remove();
      }
      maps.length = 0;
    },
  };
}
