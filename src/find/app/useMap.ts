// What both maps of the app share: MapLibre with the app's style, loaded on demand, not turned by gestures, following the size of its box.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GeoJSONSource, Map as MlMap, MapOptions } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { findStyle } from './mapStyle';
import { SCHEME, loadForMap } from '../offline/protocol';

type MapLibre = typeof import('maplibre-gl');

/** `setup` runs once the style is there; what it puts into `cleanup` is undone with the map. */
export function useMap(options: Omit<MapOptions, 'container' | 'style'>, setup: (ml: MapLibre, m: MlMap, cleanup: (() => void)[]) => void) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    const cleanup: (() => void)[] = [];
    void (async () => {
      const ml = await import('maplibre-gl');
      if (dead) return;
      ml.setWorkerUrl(workerUrl);
      ml.addProtocol(SCHEME, loadForMap);
      const m: MlMap = new ml.Map({ ...options, container: host.current!, style: findStyle, attributionControl: false, dragRotate: false, pitchWithRotate: false });
      cleanup.push(() => m.remove());
      m.touchZoomRotate.disableRotation();
      m.keyboard.disableRotation();
      m.addControl(new ml.AttributionControl({ compact: true }), 'bottom-left'); // the menu sits top left
      await new Promise<void>((resolve) => { m.once('style.load', () => resolve()); m.once('load', () => resolve()); });
      if (dead) return;
      const resizer = new ResizeObserver(() => m.resize());
      resizer.observe(host.current!);
      cleanup.push(() => resizer.disconnect());
      setup(ml, m, cleanup);
    })().catch(() => { if (!dead) setFailed(true); });
    return () => {
      dead = true;
      cleanup.splice(0).reverse().forEach((stop) => stop());
    };
  }, []);

  return { host, failed };
}

export function setData(m: MlMap, id: 'route' | 'found', features: GeoJSON.Feature[]): void {
  void (m.getSource(id) as GeoJSONSource).setData({ type: 'FeatureCollection', features });
}

/** The element of the marker that shows where one stands. */
export function meElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'find-me';
  el.setAttribute('aria-label', 'Mein Standort');
  return el;
}
