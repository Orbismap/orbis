import { memo } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { startRuntime } from '../layers/runtime';
import { takeAdoptedMap } from '../map/adopt';
import { createMapEngine } from '../map/engine';
import { activeKarte } from '../state/session';
import { mapEngine, pointerLngLat } from '../state/ui';
import { placeCursorTip } from '../features/legend/CursorTip';
import { cursorTipHidden } from '../features/legend/pointer-value';
import { startMyLocationMarker } from '../features/tools/my-location';
import { startProbeMarker } from '../features/probe/marker';
import { startRouteOverlay } from '../features/routes/overlay';

/** Hosts the MapLibre map. Reads no signals, so it never re-renders. */
export const MapView = memo(function MapView() {
  const host = useRef<HTMLDivElement>(null);
  const adopted = useRef(takeAdoptedMap());
  // In the same commit as the first render, so the weather app's running map never leaves the screen.
  useLayoutEffect(() => {
    if (adopted.current) host.current!.appendChild(adopted.current.element);
  }, []);
  useEffect(() => {
    const k = activeKarte.peek();
    const engine = createMapEngine(host.current!, { basemap: k.basemap, labels: k.labels, terminator: k.terminator, adopt: adopted.current?.map });
    adopted.current?.map.resize();
    const stopRuntime = startRuntime(engine);
    mapEngine.value = engine;
    (window as unknown as { orbis?: unknown }).orbis = { engine };
    // Pointer position for legend marker and cursor tooltip: one value query per animation frame (mouse only).
    const el = host.current!;
    let raf = 0;
    let ev: PointerEvent | undefined;
    const frame = () => {
      raf = 0;
      if (!ev) return;
      const { clientX, clientY, buttons } = ev;
      const r = el.getBoundingClientRect();
      const ll = engine.ml.unproject([clientX - r.left, clientY - r.top]);
      pointerLngLat.value = { lng: ll.lng, lat: ll.lat };
      // object hover (own pointer cursor), dragging and zooming/rotating take precedence over the tooltip
      cursorTipHidden.value = buttons !== 0 || engine.ml.isMoving() || engine.ml.getCanvas().style.cursor === 'pointer';
      placeCursorTip(clientX, clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      ev = e;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onLeave = () => {
      ev = undefined;
      if (raf) cancelAnimationFrame(raf), (raf = 0);
      pointerLngLat.value = null;
    };
    const onMoveStart = () => (cursorTipHidden.value = true);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    engine.ml.on('movestart', onMoveStart);
    const stops = [startProbeMarker(), startMyLocationMarker(), startRouteOverlay(), () => (cancelAnimationFrame(raf), el.removeEventListener('pointermove', onMove), el.removeEventListener('pointerleave', onLeave), engine.ml.off('movestart', onMoveStart))];
    return () => {
      stops.forEach((s) => s());
      stopRuntime();
      mapEngine.value = null;
      engine.destroy();
    };
  }, []);
  // maplibre-gl.css (unlayered) sets position:relative on its container, so the sizing lives on a wrapper
  return (
    <div class="map wx-map-host" role="application" aria-label="Karte" data-behind-modal>
      <div ref={host} style={{ width: '100%', height: '100%' }} />
    </div>
  );
});
