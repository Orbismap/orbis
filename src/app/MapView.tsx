import { memo } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { startRuntime } from '../layers/runtime';
import { createMapEngine } from '../map/engine';
import { activeKarte } from '../state/session';
import { mapEngine, pointerLngLat } from '../state/ui';
import { startProbeMarker } from '../features/probe/marker';
import { startLocateOverlay } from '../features/tools/locate';

/** Hosts the MapLibre map. Reads no signals, so it never re-renders. */
export const MapView = memo(function MapView() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = activeKarte.peek();
    const engine = createMapEngine(host.current!, { basemap: k.basemap, labels: k.labels, terminator: k.terminator });
    const stopRuntime = startRuntime(engine);
    mapEngine.value = engine;
    (window as unknown as { orbis?: unknown }).orbis = { engine };
    // pointer position for the legend marker; TODO(runtime): feed it to LayerHandle.probe() and write
    // features/legend/pointer-value.ts (pointerValue) once the runtime exposes a probeAt().
    const el = host.current!;
    let last = 0;
    const onMove = (e: MouseEvent) => {
      const t = performance.now();
      if (t - last < 80) return;
      last = t;
      const r = el.getBoundingClientRect();
      const ll = engine.ml.unproject([e.clientX - r.left, e.clientY - r.top]);
      pointerLngLat.value = { lng: ll.lng, lat: ll.lat };
    };
    const onLeave = () => (pointerLngLat.value = null);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    const stops = [startProbeMarker(), startLocateOverlay(), () => (el.removeEventListener('mousemove', onMove), el.removeEventListener('mouseleave', onLeave))];
    return () => {
      stops.forEach((s) => s());
      stopRuntime();
      mapEngine.value = null;
      engine.destroy();
    };
  }, []);
  // maplibre-gl.css (unlayered) sets position:relative on its container, so the sizing lives on a wrapper
  return (
    <div class="map" role="application" aria-label="Karte">
      <div ref={host} style={{ width: '100%', height: '100%' }} />
    </div>
  );
});
