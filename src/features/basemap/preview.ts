// Live miniatures of basemaps for the picker: one hidden MapLibre map renders them one after the other at the position, zoom, bearing,
// tilt and projection of the big map (scaled down, so a thumbnail shows the same area as a shrunken copy) and hands each result over as
// an image. One WebGL context; every miniature is rendered once per opening of the picker, and the map is gone when the picker closes.
import { signal } from '@preact/signals';
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import { BASEMAPS, TERRAIN_SOURCE, TERRAIN_SPEC } from '../../map/basemaps';
import { OFM_GLYPHS, OFM_SOURCE } from '../../map/basemaps/vector';
import type { StaticBasemapId } from '../../map/types';
import { camera, projection, viewport } from '../../state/view';

/** basemap id -> data URL of its miniature (missing until rendered) */
export const previewImages = signal<Partial<Record<string, string>>>({});

/** render size in px: 3:2, 2x of the largest thumbnail, so it stays sharp */
const W = 432;
const H = 288;
const TIMEOUT = 8000;

/** Just this basemap, visible, without labels and slots. */
function styleFor(id: StaticBasemapId, proj: 'globe' | 'mercator'): StyleSpecification {
  const def = BASEMAPS[id];
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
  request(ids: readonly StaticBasemapId[], first?: boolean): void;
  /** Stops and frees the map. */
  dispose(): void;
}

/** The view of the big map is read once, now; the picker shows a snapshot of it. */
export function createPreviews(): Previews {
  previewImages.value = {};
  const cam = camera.peek();
  const proj = projection.peek();
  // same area as the big map, shrunk: the thumbnail sits as many zoom steps below the camera as it is smaller than the viewport
  const zoom = Math.max(0, cam.zoom + Math.log2(H / Math.max(H, viewport.peek()?.height ?? 800)));
  let dead = false;
  let running = false;
  let host: HTMLDivElement | undefined;
  let ml: maplibregl.Map | undefined;
  let queue: StaticBasemapId[] = [];
  const known = new Set<string>();

  const render = async (id: StaticBasemapId) => {
    if (!ml) {
      host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = `position:fixed;left:-10000px;top:0;width:${W}px;height:${H}px;pointer-events:none`;
      document.body.append(host);
      ml = new maplibregl.Map({
        container: host, style: styleFor(id, proj), center: [cam.lng, cam.lat], zoom, bearing: cam.bearing, pitch: cam.pitch,
        interactive: false, attributionControl: false, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true },
      });
    } else ml.setStyle(styleFor(id, proj));
    const map = ml;
    await sleep(150);
    const t0 = performance.now();
    while (!dead && performance.now() - t0 < TIMEOUT && !(map.isStyleLoaded() && map.areTilesLoaded())) await sleep(100);
    if (dead) return;
    // the canvas holds the finished frame only inside a render event
    const url = await new Promise<string>((res) => {
      map.once('render', () => res(map.getCanvas().toDataURL('image/webp', 0.85)));
      map.triggerRepaint();
    });
    if (!dead) previewImages.value = { ...previewImages.peek(), [id]: url };
  };

  const pump = async () => {
    if (running) return;
    running = true;
    while (!dead && queue.length) {
      const id = queue.shift()!;
      try { await render(id); } catch { /* a failed miniature stays the plain colour of its basemap */ }
    }
    running = false;
  };

  return {
    request(ids, first = false) {
      const fresh = ids.filter((id) => !known.has(id));
      for (const id of fresh) known.add(id);
      queue = first ? [...fresh, ...queue] : [...queue, ...fresh];
      void pump();
    },
    dispose() {
      dead = true;
      ml?.remove();
      host?.remove();
    },
  };
}
