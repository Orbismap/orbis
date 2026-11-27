import { useRef, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import type { Map as MlMap, Marker } from 'maplibre-gl';
import type { LngLat } from '@/core/geo';
import { Icon } from '@/ui/icons/Icon';
import { BELOW_MIDDLE, NAV_PITCH, NAV_ZOOM, approach, bearingFor, type View } from '../data/camera';
import { metres } from '../data/places';
import { chosen, kind, places, target, way } from '../state/finder';
import { canEdit } from '../state/osm';
import { compass, heading, manual, position } from '../state/sensors';
import { mapBearing, openAdding, openCameraView } from '../state/ui';
import { lastView } from '../offline/state';
import { FOUND_LAYERS } from './mapStyle';
import { meElement, setData, useMap } from './useMap';

/** Without a position the map shows Germany. */
const HOME = { center: [10.4, 51.1] as LngLat, zoom: 4.8 };
/** Places within this many px of the finger count as tapped. */
const TAP = 18;
/** A finger that slides further than this many px moves the map; less is a tap. */
const SLIP = 8;

const viewOf = (m: MlMap): View => ({ center: m.getCenter().toArray(), zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing() });

/** The map: the places around, the way to the target and where one stands. A tap on a place heads for it. */
export function FindMap() {
  /** the person moved the map: it stops following until they ask */
  const [away, setAway] = useState(false);
  const recentre = useRef<() => void>(() => {});

  const { host, failed } = useMap({ ...HOME }, (ml, m, cleanup) => {
    cleanup.push(effect(() => {
      const to = target.value;
      const list = to && !places.value.some((p) => p.key === to.key) ? [...places.value, to] : places.value;
      setData(m, 'found', list.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { key: p.key, target: p.key === to?.key } })));
    }));
    cleanup.push(effect(() => {
      const w = way.value, to = target.value, p = position.value;
      const direct = !w?.ahead.length;
      const line = !w || !to || !p ? [] : direct ? [[p.lng, p.lat], [to.lng, to.lat]] : w.ahead;
      setData(m, 'route', line.length ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: line }, properties: { direct } }] : []);
    }));

    // ---- where one stands, with the direction one looks ----
    let me: Marker | undefined;
    cleanup.push(effect(() => {
      const p = position.value;
      if (!p) return;
      if (!me) me = new ml.Marker({ element: meElement(), rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([p.lng, p.lat]).addTo(m);
      else if (moved) me.setLngLat([p.lng, p.lat]); // while following, the camera carries it along
    }));
    cleanup.push(effect(() => {
      const h = heading.value;
      if (h === null || !position.value || !me) return;
      me.getElement().classList.add('find-me-facing');
      me.setRotation(h);
    }));

    // ---- camera: like a navigation app, on the own position with "ahead" up, until the person moves the map ----
    let moved = false;
    /** fingers or the mouse button on the map: the camera holds still, so that a gesture can begin */
    const held = new Map<number, [number, number]>();
    let goal: View | undefined;
    /** the camera as it was last set; undefined: the map was not on the position yet, or the person moved it */
    let shown: View | undefined;
    let placed = false;
    let frame = 0;
    let last = 0;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = (now: number) => {
      frame = 0;
      if (!goal || moved || held.size) return;
      // the first position is shown at once; later the view glides there
      const from = shown ?? (placed && !still ? viewOf(m) : goal);
      const step = approach(from, goal, still ? Infinity : Math.min(64, last ? now - last : 16));
      shown = step.view;
      placed = true;
      last = step.done ? 0 : now;
      m.jumpTo({ ...shown, padding: { top: Math.round(m.getContainer().clientHeight * BELOW_MIDDLE * 2), bottom: 0, left: 0, right: 0 } });
      me?.setLngLat(shown.center);
      if (!step.done) kick();
    };
    const kick = () => { frame ||= requestAnimationFrame(tick); };
    cleanup.push(() => cancelAnimationFrame(frame));
    cleanup.push(effect(() => {
      const p = position.value;
      const bearing = bearingFor({
        compass: compass.value === 'on', heading: heading.value, way: way.value, previous: goal?.bearing ?? 0,
      });
      mapBearing.value = bearing;
      if (!p) return;
      goal = { center: [p.lng, p.lat], zoom: NAV_ZOOM, pitch: NAV_PITCH, bearing };
      kick();
    }));
    cleanup.push(() => { mapBearing.value = 0; });
    // the map's box changes size (rotation of the device, the browser's bars)
    m.on('resize', () => { shown = undefined; placed = false; kick(); });

    // where the choice of an offline area starts: what this map shows, taken flat and north up around its middle
    const remember = () => {
      const { clientWidth: w, clientHeight: h } = m.getContainer();
      const c = m.getCenter();
      const perPixel = 360 / (512 * 2 ** m.getZoom());
      const side = (w / 2) * perPixel;
      const up = (h / 2) * perPixel * Math.cos((c.lat * Math.PI) / 180);
      lastView.value = [c.lng - side, c.lat - up, c.lng + side, c.lat + up];
    };
    m.on('moveend', remember);

    const leave = () => {
      if (moved) return;
      moved = true;
      shown = undefined;
      const p = position.peek();
      if (p) me?.setLngLat([p.lng, p.lat]);
      setAway(true);
    };
    // While the camera is gliding, MapLibre does not report the start of a gesture, so the fingers are watched here.
    const box = m.getCanvasContainer();
    const down = (e: PointerEvent) => {
      held.set(e.pointerId, [e.clientX, e.clientY]);
      if (held.size > 1) leave();
    };
    const drag = (e: PointerEvent) => {
      const start = held.get(e.pointerId);
      if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > SLIP) leave();
    };
    const up = (e: PointerEvent) => { if (held.delete(e.pointerId) && !held.size) kick(); };
    box.addEventListener('pointerdown', down);
    box.addEventListener('wheel', leave, { passive: true });
    window.addEventListener('pointermove', drag);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    cleanup.push(() => {
      box.removeEventListener('pointerdown', down);
      box.removeEventListener('wheel', leave);
      window.removeEventListener('pointermove', drag);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    });
    // everything else the person moves the map with (keys, double tap)
    m.on('movestart', (e) => { if ((e as { originalEvent?: Event }).originalEvent) leave(); });
    m.on('dblclick', leave);

    const follow = () => {
      moved = false;
      setAway(false);
      m.stop();
      kick();
    };
    recentre.current = follow;
    // a searched place (or the way back from it) and another kind move the view, even after the map was moved by hand
    let from = manual.peek(), looked = kind.peek();
    cleanup.push(effect(() => {
      if (manual.value === from && kind.value === looked) return;
      from = manual.value;
      looked = kind.value;
      follow();
    }));

    m.on('click', (e) => {
      const [hit] = m.queryRenderedFeatures([[e.point.x - TAP, e.point.y - TAP], [e.point.x + TAP, e.point.y + TAP]], { layers: FOUND_LAYERS })
        .map((f) => places.peek().find((p) => p.key === f.properties.key))
        .filter((p) => !!p)
        .sort((a, b) => metres([e.lngLat.lng, e.lngLat.lat], [a.lng, a.lat]) - metres([e.lngLat.lng, e.lngLat.lat], [b.lng, b.lat]));
      if (!hit) return;
      chosen.value = hit;
      follow();
    });
  });

  return (
    <section class="find-map" aria-label="Karte">
      <div ref={host} class="find-map-canvas" />
      {failed && <p class="find-map-failed" role="status">Die Karte kann auf diesem Gerät nicht angezeigt werden. Der Pfeil funktioniert trotzdem.</p>}
      <div class="find-corner">
        {away && <button type="button" class="find-pill" onClick={() => recentre.current()}>Zentrieren</button>}
        {canEdit && kind.value.add && position.value && manual.value === null && <button type="button" class="find-pill find-pill-add" aria-label={`${kind.value.name} eintragen`} onClick={openAdding}><Icon name="plus" size={18} /></button>}
        {position.value && manual.value === null && <button type="button" class="find-pill" aria-label="Kameraansicht (AR)" onClick={openCameraView}>AR</button>}
      </div>
    </section>
  );
}
