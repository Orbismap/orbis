import { useRef, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import type { Marker } from 'maplibre-gl';
import { bboxOf, type LngLat } from '@/core/geo';
import { Icon } from '@/ui/icons/Icon';
import { metres } from '../data/places';
import { chosen, kind, places, target, way } from '../state/finder';
import { canEdit } from '../state/osm';
import { heading, manual, position } from '../state/sensors';
import { openAdding, openCameraView } from '../state/ui';
import { FOUND_LAYERS } from './mapStyle';
import { meElement, setData, useMap } from './useMap';

/** Without a position the map shows Germany. */
const HOME = { center: [10.4, 51.1] as LngLat, zoom: 4.8 };
/** Places within this many px of the finger count as tapped. */
const TAP = 18;
/** Tilt of the view around the own position, so that the buildings stand up. */
const PITCH = 50;
/** The view follows after this many metres of movement. */
const FOLLOW_M = 12;

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
      if (!me) {
        me = new ml.Marker({ element: meElement(), rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([p.lng, p.lat]).addTo(m);
      } else me.setLngLat([p.lng, p.lat]);
    }));
    cleanup.push(effect(() => {
      const h = heading.value;
      if (h === null || !position.value || !me) return;
      me.getElement().classList.add('find-me-facing');
      me.setRotation(h);
    }));

    // ---- camera: position, target and the way between stay in view until the person moves the map ----
    let moved = false;
    let framedAt: LngLat | undefined;
    let framedKey: string | undefined;
    const frame = () => {
      const p = position.peek();
      if (!p) return;
      const to = target.peek();
      const first = framedAt === undefined;
      framedAt = [p.lng, p.lat];
      framedKey = to?.key;
      const box = to && bboxOf([[p.lng, p.lat], [to.lng, to.lat], ...(way.peek()?.ahead ?? [])]);
      const duration = first ? 0 : 600;
      if (box) m.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: 56, maxZoom: 17.5, pitch: PITCH, duration });
      else m.easeTo({ center: [p.lng, p.lat], zoom: 16, pitch: PITCH, duration });
    };
    cleanup.push(effect(() => {
      const p = position.value, to = target.value;
      if (!p || moved) return;
      if (!framedAt || framedKey !== to?.key || metres(framedAt, [p.lng, p.lat]) > FOLLOW_M) frame();
    }));
    m.on('movestart', (e) => {
      if (!(e as { originalEvent?: Event }).originalEvent) return;
      moved = true;
      setAway(true);
    });
    const follow = () => {
      moved = false;
      setAway(false);
      frame();
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
