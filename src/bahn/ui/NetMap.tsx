import { useEffect, useRef } from 'preact/hooks';
import type { GeoJSONSource, Map as MlMap, Marker } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { bahnStyle } from './mapStyle';

export interface MapMarker {
  id: string;
  lng: number;
  lat: number;
  kind: 'stop' | 'start' | 'end' | 'selected';
  label?: string;
}
export interface MapRoute {
  coords: [number, number][];
  color: string;
  dashed?: boolean;
}

interface Props {
  /** Mitte, wenn nichts eingepasst wird. */
  center?: [number, number];
  zoom?: number;
  /** Eigener Standort. */
  me?: [number, number] | null;
  markers?: MapMarker[];
  routes?: MapRoute[];
  /** Karte auf alle Marker und Routen einpassen. */
  fit?: boolean;
  interactive?: boolean;
  /** Ausschnittwechsel sanft fliegen statt springen (Desktop-Karte, die zwischen Bildschirmen bleibt). */
  animate?: boolean;
  onMarker?: (id: string) => void;
  class?: string;
}

const dom = (cls: string, text?: string): HTMLDivElement => {
  const el = document.createElement('div');
  el.className = cls;
  if (text) el.textContent = text;
  return el;
};

/**
 * Karte der Bus-&-Bahn-App (MapLibre, dunkler OpenFreeMap-Stil mit Schienennetz). Der Code lädt MapLibre erst,
 * wenn eine Karte gebraucht wird. Später übernimmt hier die Orbis-Engine mit ihren Ebenen.
 */
export function NetMap({ center = [10.4, 51.1], zoom = 15, me, markers = [], routes = [], fit = false, interactive = true, animate = false, onMarker, class: cls }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef<Promise<MlMap> | null>(null);
  const live = useRef<Marker[]>([]);
  const lib = useRef<typeof import('maplibre-gl') | null>(null);
  const onMarkerRef = useRef(onMarker);
  onMarkerRef.current = onMarker;

  // Karte anlegen.
  useEffect(() => {
    let dead = false;
    let resizer: ResizeObserver | undefined;
    ready.current = (async () => {
      const ml = await import('maplibre-gl');
      lib.current = ml;
      ml.setWorkerUrl(workerUrl);
      const m = new ml.Map({
        container: host.current!,
        style: bahnStyle,
        center,
        zoom,
        attributionControl: { compact: true },
        interactive,
        dragRotate: false,
        pitchWithRotate: false,
      });
      m.touchZoomRotate.disableRotation();
      await new Promise<void>((resolve) => (m.loaded() ? resolve() : m.once('load', () => resolve())));
      if (dead) {
        m.remove();
        throw new Error('disposed');
      }
      m.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'routes-casing', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0a0f18', 'line-width': 9, 'line-opacity': 0.8 } });
      m.addLayer({ id: 'routes-line', type: 'line', source: 'routes', filter: ['!=', ['get', 'dashed'], true], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 5 } });
      m.addLayer({ id: 'routes-dash', type: 'line', source: 'routes', filter: ['==', ['get', 'dashed'], true], layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [1, 2] } });
      map.current = m;
      // Die Karte steckt oft in einem Container, dessen Größe sich ändert (ziehbares Blatt, Drehen).
      resizer = new ResizeObserver(() => m.resize());
      resizer.observe(host.current!);
      return m;
    })();
    ready.current.catch(() => undefined);
    return () => {
      dead = true;
      resizer?.disconnect();
      live.current.forEach((x) => x.remove());
      live.current = [];
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inhalte und Ausschnitt nachführen.
  useEffect(() => {
    let cancelled = false;
    ready.current?.then((m) => {
      if (cancelled || !lib.current) return;
      const ml = lib.current;
      (m.getSource('routes') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: routes.filter((r) => r.coords.length > 1).map((r) => ({ type: 'Feature', properties: { color: r.color, dashed: !!r.dashed }, geometry: { type: 'LineString', coordinates: r.coords } })),
      });
      live.current.forEach((x) => x.remove());
      live.current = [];
      for (const k of markers) {
        const el = dom(`bn-mk bn-mk-${k.kind}`);
        if (k.label && k.kind !== 'stop') el.dataset.label = k.label;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onMarkerRef.current?.(k.id);
        });
        live.current.push(new ml.Marker({ element: el }).setLngLat([k.lng, k.lat]).addTo(m));
      }
      if (me) live.current.push(new ml.Marker({ element: dom('bn-me') }).setLngLat(me).addTo(m));

      const pts: [number, number][] = [...routes.flatMap((r) => r.coords), ...markers.map((k): [number, number] => [k.lng, k.lat])];
      if (fit && pts.length > 1) {
        const b = pts.reduce((acc, p) => acc.extend(p), new ml.LngLatBounds(pts[0], pts[0]));
        m.fitBounds(b, { padding: animate ? 64 : 36, duration: animate ? 700 : 0, maxZoom: 15 });
      } else if (animate) {
        m.easeTo({ center, zoom, duration: 700 });
      } else {
        m.jumpTo({ center, zoom });
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(routes), JSON.stringify(markers), me?.[0], me?.[1], center[0], center[1], zoom, fit]);

  return <div ref={host} class={`bn-map ${cls ?? ''}`} />;
}
