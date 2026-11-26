import { useEffect, useRef, useState } from 'preact/hooks';
import { effect, signal } from '@preact/signals';
import type { GeoJSONSource, Map as MlMap, MapGeoJSONFeature, Marker, PointLike } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Stop } from '../data/types';
import { matchesQuery } from '../data/stops';
import { sources } from '../state/sources';
import { position, requestLocation } from '../state/location';
import { openStop } from '../state/nav';
import { bahnStyle } from './mapStyle';
import { LAYERS, NEARBY_ZOOM, SOURCES, TAP_LAYERS, cssModeColor, nearbyFeatures, routeFeatures, stopFeatures } from './mapLayers';
import { scene, type Scene } from './scene';
import { sheetCover } from './sheetState';

/** Ohne Standort und Szene zeigt die Karte Deutschland. */
const HOME = { center: [10.4, 51.1] as [number, number], zoom: 5.2 };
/** Treffer in diesem Umkreis des Fingers (px). */
const TAP = 14;
/** Höchstens so viele Haltestellen der Umgebung werden behalten. */
const KEEP = 800;

const locateRequest = signal(0);
/** Karte auf den eigenen Standort fahren (fragt ihn bei Bedarf an). */
export async function showMyLocation() {
  if (!position.value) await requestLocation();
  if (position.value) locateRequest.value++;
}

const cameraKey = (s: Scene) => JSON.stringify([s.fit, s.center, s.zoom]);

/** Die eine Karte der App (MapLibre, lädt erst beim ersten Bild). Immer bedienbar; Haltestellen und Strecken antippbar. */
export function TransitMap() {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    const cleanup: (() => void)[] = [];
    void (async () => {
      const ml = await import('maplibre-gl');
      if (dead) return;
      ml.setWorkerUrl(workerUrl);
      const first = scene.peek();
      const m: MlMap = new ml.Map({
        container: host.current!, style: bahnStyle, center: first.center ?? HOME.center, zoom: first.zoom ?? HOME.zoom,
        attributionControl: false, dragRotate: false, pitchWithRotate: false,
      });
      cleanup.push(() => m.remove());
      m.touchZoomRotate.disableRotation();
      m.keyboard.disableRotation();
      m.addControl(new ml.AttributionControl({ compact: true }), 'top-left');
      // 'style.load' reicht für eigene Ebenen und kommt auch, wenn die Kacheln nicht erreichbar sind
      await new Promise<void>((resolve) => { m.once('style.load', () => resolve()); m.once('load', () => resolve()); });
      if (dead) return;

      for (const id of SOURCES) m.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      for (const layer of LAYERS) m.addLayer(layer);
      const set = (id: (typeof SOURCES)[number], data: GeoJSON.FeatureCollection) => (m.getSource(id) as GeoJSONSource).setData(data);

      const resizer = new ResizeObserver(() => m.resize());
      resizer.observe(host.current!);
      cleanup.push(() => resizer.disconnect());

      // ---- Kamera: die Szene bewegt sie, bis der Nutzer selbst die Karte bewegt ----
      let moved = false;
      m.on('movestart', (e) => { if ((e as { originalEvent?: Event }).originalEvent) moved = true; });
      const padding = (cover: number) => ({ top: 24, bottom: Math.min(cover, host.current!.clientHeight * 0.62), left: 0, right: 0 });
      const apply = (s: Scene, duration: number) => {
        moved = false;
        if (s.fit && s.fit.length > 1) {
          const bounds = s.fit.reduce((b, p) => b.extend(p), new ml.LngLatBounds(s.fit[0], s.fit[0]));
          m.fitBounds(bounds, { padding: { top: 32, bottom: 32, left: 40, right: 40 }, maxZoom: 15.5, duration });
        } else if (s.fit?.length === 1 || s.center) {
          m.easeTo({ center: s.fit?.[0] ?? s.center, zoom: s.zoom ?? 15.5, duration });
        }
      };

      let camera = '';
      let started = false;
      cleanup.push(effect(() => {
        const s = scene.value;
        set('routes', routeFeatures(s.routes ?? []));
        set('stops', stopFeatures(s.stops ?? []));
        const key = cameraKey(s);
        if (key === camera) return;
        camera = key;
        apply(s, started ? 600 : 0);
        started = true;
      }));
      cleanup.push(effect(() => {
        const next = padding(sheetCover.value);
        // wer selbst gesucht hat, behält seinen Ausschnitt; sonst wird die Szene im neuen Bereich wieder ganz gezeigt
        if (moved) m.easeTo({ padding: next, duration: 250 });
        else {
          m.setPadding(next);
          apply(scene.peek(), 250);
        }
      }));

      // ---- eigener Standort ----
      let me: Marker | undefined;
      cleanup.push(effect(() => {
        const p = position.value;
        if (!p) return;
        if (!me) {
          const el = document.createElement('div');
          el.className = 'bn-me';
          el.setAttribute('aria-label', 'Mein Standort');
          me = new ml.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m);
        } else me.setLngLat([p.lng, p.lat]);
      }));
      cleanup.push(effect(() => {
        const p = position.peek();
        if (locateRequest.value && p) m.flyTo({ center: [p.lng, p.lat], zoom: Math.max(m.getZoom(), 15.5), duration: 700 });
      }));

      // ---- Haltestellen der Umgebung ----
      const nearby = new Map<string, Stop>();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let request: AbortController | undefined;
      const loadNearby = () => {
        clearTimeout(timer);
        if (m.getZoom() < NEARBY_ZOOM) return;
        timer = setTimeout(() => {
          request?.abort();
          request = new AbortController();
          const b = m.getBounds();
          sources.transit.stopsIn([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], request.signal).then(
            (found) => {
              if (dead) return;
              for (const s of found) { nearby.delete(s.id); nearby.set(s.id, s); }
              for (const id of [...nearby.keys()].slice(0, Math.max(0, nearby.size - KEEP))) nearby.delete(id);
              set('nearby', nearbyFeatures([...nearby.values()], cssModeColor));
            },
            () => undefined, // ohne Netz bleiben die geladenen stehen
          );
        }, 350);
      };
      m.on('moveend', loadNearby);
      loadNearby();
      cleanup.push(() => { clearTimeout(timer); request?.abort(); });

      // ---- Antippen ----
      const hit = (x: number, y: number): MapGeoJSONFeature | undefined => {
        const box: [PointLike, PointLike] = [[x - TAP, y - TAP], [x + TAP, y + TAP]];
        const found = m.queryRenderedFeatures(box, { layers: TAP_LAYERS.filter((l) => m.getLayer(l)) });
        const distance = (f: MapGeoJSONFeature) => {
          if (f.geometry.type !== 'Point') return 0;
          const p = m.project(f.geometry.coordinates as [number, number]);
          return Math.hypot(p.x - x, p.y - y);
        };
        const rank = (f: MapGeoJSONFeature) => TAP_LAYERS.indexOf(f.layer.id as (typeof TAP_LAYERS)[number]);
        return found.sort((a, b) => rank(a) - rank(b) || distance(a) - distance(b))[0];
      };
      m.on('click', (e) => {
        const f = hit(e.point.x, e.point.y);
        if (!f) return;
        const id = String(f.properties.id ?? '');
        if (f.layer.id === 'routes-hit') scene.peek().onRoute?.(id);
        else if (f.layer.id === 'stops-dots') {
          const s = scene.peek().stops?.find((x) => x.stop.id === id);
          if (s) openStop(s.stop);
        } else if (f.layer.id === 'nearby-dots') {
          const s = nearby.get(id);
          if (s) openStop(s);
        } else if (f.geometry.type === 'Point') {
          // Bahnhof des Grundstils: die passende Haltestelle der Fahrplanquelle suchen
          const [lng, lat] = f.geometry.coordinates as [number, number];
          const name = String(f.properties['name:de'] ?? f.properties.name ?? '');
          sources.transit.nearbyStops(lat, lng).then((list) => {
            const s = list.find((x) => matchesQuery(x.name, name)) ?? list[0];
            if (s && !dead) openStop(s);
          }, () => undefined);
        }
      });
      m.on('mousemove', (e) => { m.getCanvas().style.cursor = hit(e.point.x, e.point.y) ? 'pointer' : ''; });
    })().catch(() => !dead && setFailed(true));

    return () => {
      dead = true;
      for (const f of cleanup.splice(0).reverse()) f();
    };
  }, []);

  return (
    <div class="bn-mapwrap">
      <div ref={host} class="bn-map" role="region" aria-label="Karte" />
      {failed && <p class="bn-map-error" role="alert">Die Karte lässt sich nicht laden.</p>}
    </div>
  );
}
