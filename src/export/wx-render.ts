/**
 * Entry point for the weather renderers, used by the weather app (`src/wetter`) as a lazy chunk.
 *
 * This module deliberately depends only on the render kit and a tiny slice of orbis state.
 * It does NOT import the map engine, the layer registry or the app shell.
 */
import { signal, type Signal } from '@preact/signals';
import type { CustomLayerInterface, LayerSpecification, Map as MlMap, SourceSpecification } from 'maplibre-gl';
import { fetchJson } from '../data/http';
import type { LayerContext, LayerHandle, LayerStatus } from '../layers/types';
import type { MapEngine } from '../map/types';
import { fieldLayer } from '../render/gl/field';
import { particleLayer } from '../render/gl/particles';
import { radarLayer, type RadarFrame } from '../render/gl/radarLayer';
import { PRECIP, TEMPERATURE, WIND } from '../render/gl/scales';
import { settings } from '../state/settings';

/** The exact scales used by orbis-karten's weather layers, for widget swatches/legends. */
export const WX_SCALES = { wind: WIND, temp: TEMPERATURE, precip: PRECIP };

export type WeatherMode = 'wind' | 'precip' | 'temp' | 'radar';

export interface WeatherMountOptions {
  mode: WeatherMode;
  /** MapLibre layer id before which the weather layers are inserted (wetter uses `places`). */
  beforeId?: string;
  opacity?: number;
  /** Wind particles on top of the speed field (default true). */
  particles?: boolean;
  onStatus?: (status: LayerStatus) => void;
}

export interface WeatherMountHandle {
  destroy(): void;
}

// TODO(phase 4): this writes the shared settings signal. Fine while the weather app is a separate document;
// once the map app runs in the same document, make the motion override local to the weather layers.
// The compact map must animate even when the OS prefers reduced motion or the map setting differs.
settings.value = { ...settings.value, motion: 'full' };

/** Adapter: the render kit uses a small subset of MapEngine. Wrap the host's existing MapLibre map. */
function engineFor(map: MlMap, beforeId: string): MapEngine {
  const place = (spec: LayerSpecification | CustomLayerInterface) => {
    if (!map.getLayer(spec.id)) map.addLayer(spec as LayerSpecification, beforeId);
  };
  return {
    ml: map,
    addSource(id: string, spec: SourceSpecification) {
      if (!map.getSource(id)) map.addSource(id, spec);
    },
    addLayer(spec: LayerSpecification) { place(spec); },
    addCustomLayer(layer: CustomLayerInterface) { place(layer); },
    remove({ layers = [], sources = [] }) {
      for (const id of layers) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of sources) {
        try { if (map.getSource(id)) map.removeSource(id); } catch { /* still in use */ }
      }
    },
    requestRender() { map.triggerRepaint(); },
    moveToSlotTop() {},
  } as unknown as MapEngine;
}

/** Minimal LayerContext: the three renderers only read map/signal/opacity/time/status. */
function contextFor(
  id: string,
  engine: MapEngine,
  abort: AbortSignal,
  opacity: Signal<number>,
  time: Signal<number>,
  onStatus?: (status: LayerStatus) => void,
): LayerContext {
  return {
    id,
    map: engine,
    signal: abort,
    opacity,
    options: signal({}),
    time,
    status: (status: LayerStatus) => onStatus?.(status),
    resource: () => { throw new Error('wx-render: resource() is not used by the weather render kit'); },
    feed: () => {},
    key: () => signal<string | undefined>(undefined),
    select: () => {},
    selection: signal(null),
  } as unknown as LayerContext;
}

interface RainViewer {
  host: string;
  radar: { past: { time: number; path: string }[]; nowcast?: { time: number; path: string }[] };
}

async function loadRadarFrames(abort: AbortSignal, frames: Signal<RadarFrame[]>): Promise<void> {
  try {
    const { data } = await fetchJson<RainViewer>('https://api.rainviewer.com/public/weather-maps.json', {
      signal: abort,
      revalidate: true,
    });
    // colour scheme 2 (universal blue), smoothed, no snow – the shader reads rain rates back out.
    const steps = [...data.radar.past, ...(data.radar.nowcast ?? [])];
    frames.value = steps.map((frame) => ({
      time: frame.time * 1000,
      url: `${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_0.png`,
    }));
  } catch {
    /* radarLayer reports the failure through onStatus */
  }
}

/**
 * Mount one weather layer on an existing MapLibre map using orbis-karten's own renderer.
 * Returns a handle whose `destroy()` removes every layer, source, listener and timer.
 */
export function mountWeatherLayer(map: MlMap, options: WeatherMountOptions): WeatherMountHandle {
  const controller = new AbortController();
  const engine = engineFor(map, options.beforeId ?? 'places');
  const opacity = signal(options.opacity ?? 1);
  const time = signal(Date.now());
  const ctx = contextFor(`wx-${options.mode}`, engine, controller.signal, opacity, time, options.onStatus);

  let handle: LayerHandle;
  switch (options.mode) {
    case 'radar': {
      const frames = signal<RadarFrame[]>([]);
      handle = radarLayer(ctx, {
        frames,
        attribution: 'Radar: <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>',
        maxzoom: 7,
        maxGap: 20 * 60_000,
        sourceName: 'RainViewer',
      });
      void loadRadarFrames(controller.signal, frames);
      break;
    }
    case 'wind': {
      const field = fieldLayer(ctx, {
        vars: ['u', 'v'],
        mode: 'magnitude',
        scale: WIND,
        label: 'Wind',
        format: (v) => `${Math.round(v)} km/h`,
      });
      const particles = options.particles === false ? undefined : particleLayer(ctx);
      handle = {
        destroy() {
          particles?.destroy();
          field.destroy();
        },
      };
      break;
    }
    case 'temp':
      handle = fieldLayer(ctx, {
        vars: ['temperature_2m'],
        scale: TEMPERATURE,
        label: 'Temperatur',
        terrain: { enabled: true, kind: 'T' },
        contours: { interval: 1000, width: 1.3, alpha: 0.8 },
        format: (v) => `${v.toFixed(1)}°`,
      });
      break;
    case 'precip':
      handle = fieldLayer(ctx, {
        vars: ['precipitation'],
        scale: PRECIP,
        label: 'Niederschlag',
        format: (v) => `${v.toFixed(1)} mm`,
      });
      break;
  }

  // Keep "live" semantics: the shaders interpolate the two model steps around now.
  const clock = setInterval(() => { time.value = Date.now(); }, 30_000);

  return {
    destroy() {
      clearInterval(clock);
      controller.abort();
      handle.destroy();
    },
  };
}
