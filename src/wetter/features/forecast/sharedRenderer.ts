/**
 * The weather render kit (wind, temperature, precipitation, radar) lives in this repo: `src/export/wx-render.ts`.
 * It is a dynamic import, so the shaders and particle code form their own chunk that loads when the first weather
 * layer is mounted. (Before the repos were merged this was a runtime fetch of `/wx-render/v1.js` with a version pin.)
 */
import type { Map as MlMap } from 'maplibre-gl';

export type WeatherMode = 'wind' | 'precip' | 'temp' | 'radar';

export interface WeatherMountOptions {
  mode: WeatherMode;
  beforeId?: string;
  opacity?: number;
  particles?: boolean;
  onStatus?: (status: { state: 'loading' | 'ready' | 'empty' | 'error'; note?: string }) => void;
}

export interface WeatherLayerHandle {
  destroy(): void;
}

export interface WxRenderModule {
  mountWeatherLayer(map: MlMap, options: WeatherMountOptions): WeatherLayerHandle;
}

/** Loaded once and cached for the lifetime of the page. */
export function loadWxRender(): Promise<WxRenderModule> {
  return import('../../../export/wx-render');
}
