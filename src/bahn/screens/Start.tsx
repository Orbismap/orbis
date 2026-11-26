import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { haversine } from '@/core/geo';
import { Icon } from '../ui/icons';
import { MapSheet } from '../ui/MapSheet';
import { useScene, type Scene } from '../ui/scene';
import { DepartureRow } from '../ui/Departures';
import { distance } from '../ui/format';
import { MODE_GROUPS } from '../data';
import type { Stop } from '../data/types';
import { sources } from '../state/sources';
import { locationState, position, requestLocation } from '../state/location';
import { favorites, recents, type Saved } from '../state/places';
import { modes, openBoard, origin, push, swapEnds, to, when, from } from '../state/nav';
import { useAsync, useDepartures, useNow } from '../state/hooks';

/** Start: Karte (nur mit bekanntem Standort), Von/Nach, Zeit und Filter, darunter Abfahrten in der Nähe. */
export function Start() {
  const o = origin.value;
  const mine: [number, number] | null = position.value && !from.value ? [position.value.lng, position.value.lat] : null;
  const scene = o ? { center: [o.lng, o.lat] as [number, number], zoom: 15, me: mine, markers: from.value ? [{ id: 'from', lng: o.lng, lat: o.lat, kind: 'start' as const }] : [], interactive: true } : {};
  const content = (
    <>
      <RouteCard />
      <TimeRow />
      {!o && <LocateBanner />}
      {o && <Nearby origin={o} />}
      <Shortcuts />
    </>
  );

  if (!o) return <NoLocationStart scene={scene}>{content}</NoLocationStart>;
  return (
    <MapSheet scene={scene} overlay={<div class="bn-brand">Bus &amp; Bahn</div>}>
      {content}
    </MapSheet>
  );
}

/** Ohne Standort gibt es auf dem Handy keine Karte: Das Blatt reicht bis ganz nach oben. Auf dem Desktop zeigt die Karte Deutschland. */
function NoLocationStart({ scene, children }: { scene: Scene; children: ComponentChildren }) {
  useScene(scene);
  return (
    <div class="bn-start">
      <div class="bn-sheet">
        <h1 class="bn-title">Bus &amp; Bahn</h1>
        {children}
      </div>
    </div>
  );
}

function RouteCard() {
  const o = origin.value;
  const d = to.value;
  const go = () => o && d && push({ kind: 'journeys' });
  return (
    <>
      <div class="bn-route">
        <button type="button" class="bn-route-row" onClick={() => push({ kind: 'search', target: 'from' })}>
          <span class="bn-dot" />
          <span class={o ? '' : 'bn-dim'}>{o ? o.name : 'Start'}</span>
        </button>
        <button type="button" class="bn-route-row" onClick={() => push({ kind: 'search', target: 'to' })}>
          <span class="bn-dot bn-dot-end" />
          <span class={d ? '' : 'bn-dim'}>{d ? d.name : 'Wohin?'}</span>
        </button>
        <button type="button" class="bn-swap" aria-label="Start und Ziel tauschen" onClick={swapEnds}><Icon name="swap" size={16} /></button>
      </div>
      {o && d && <button type="button" class="bn-cta" onClick={go}>Verbindungen suchen</button>}
    </>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function TimeRow() {
  const [open, setOpen] = useState<'time' | 'filter' | null>(null);
  const w = when.value;
  const toggle = (id: 'time' | 'filter') => setOpen((cur) => (cur === id ? null : id));
  return (
    <>
      <div class="bn-pills">
        <button type="button" class={`bn-pill ${open === 'time' || w.time ? 'on' : ''}`} onClick={() => toggle('time')}>
          {w.time ? new Intl.DateTimeFormat('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(w.time) : 'Jetzt'}
        </button>
        <button type="button" class="bn-pill" aria-pressed={w.arriveBy} onClick={() => (when.value = { ...w, arriveBy: !w.arriveBy })}>Ankunft</button>
        <button type="button" class={`bn-pill ${modes.value.length ? 'on' : ''}`} onClick={() => toggle('filter')}>Filter{modes.value.length ? ` · ${modes.value.length}` : ''}</button>
      </div>
      {open === 'time' && (
        <div class="bn-panel">
          <input
            type="datetime-local"
            class="bn-input bn-input-box"
            value={toLocalInput(w.time ?? Date.now())}
            onChange={(e) => {
              const t = Date.parse(e.currentTarget.value);
              when.value = { ...w, time: Number.isFinite(t) ? t : null };
            }}
          />
          <button type="button" class="bn-pill" onClick={() => { when.value = { time: null, arriveBy: false }; setOpen(null); }}>Jetzt</button>
        </div>
      )}
      {open === 'filter' && (
        <div class="bn-panel bn-wrap">
          {MODE_GROUPS.map((g) => (
            <button key={g.id} type="button" class="bn-pill" aria-pressed={modes.value.includes(g.id)} onClick={() => (modes.value = modes.value.includes(g.id) ? modes.value.filter((m) => m !== g.id) : [...modes.value, g.id])}>{g.label}</button>
          ))}
        </div>
      )}
    </>
  );
}

function LocateBanner() {
  const state = locationState.value;
  if (state === 'denied') return <p class="bn-note">Standortzugriff ist aus. Gib einen Start ein, oder erlaube den Standort in den Browser-Einstellungen.</p>;
  return (
    <div class="bn-banner">
      <Icon name="locate" size={22} />
      <span><b>Standort verwenden</b><small>für Haltestellen und Karte in deiner Nähe</small></span>
      <button type="button" class="bn-chipbtn" disabled={state === 'asking'} onClick={() => void requestLocation()}>{state === 'asking' ? '…' : 'Erlauben'}</button>
    </div>
  );
}

function Nearby({ origin: o }: { origin: Stop }) {
  const now = useNow();
  const stops = useAsync((signal) => sources.transit.nearbyStops(o.lat, o.lng, signal), [o.id]);
  const stop = stops.data?.[0] ?? null;
  const dep = useDepartures(stop, 8);
  if (stops.loading && !stop) return <p class="bn-note">Suche Haltestellen in der Nähe …</p>;
  if (!stop) return stops.error ? <p class="bn-note bn-late">{stops.error}</p> : null;
  const km = haversine([o.lng, o.lat], [stop.lng, stop.lat]);
  return (
    <section>
      <button type="button" class="bn-hd bn-hd-link" onClick={() => openBoard(stop)}>
        In deiner Nähe · {stop.name} · {distance(km)}<Icon name="back" size={14} class="bn-flip" />
      </button>
      {dep.loading && dep.list.length === 0 && <p class="bn-note">Lädt …</p>}
      {dep.error && dep.list.length === 0 && <p class="bn-note bn-late">{dep.error}</p>}
      {dep.list.slice(0, 4).map((d, i) => <DepartureRow key={`${d.line}${d.time.planned}${i}`} d={d} now={now} onClick={() => openBoard(stop)} />)}
    </section>
  );
}

function Shortcuts() {
  const items: Saved[] = [...favorites.list.value, ...recents.list.value.filter((r) => !favorites.has(r))].slice(0, 6);
  if (!items.length) return null;
  return (
    <section>
      <h2 class="bn-hd">Favoriten &amp; zuletzt</h2>
      {items.map((s) => (
        <button
          type="button"
          class="bn-row"
          key={s.kind === 'stop' ? s.stop.id : `${s.from.id}-${s.to.id}`}
          onClick={() => {
            if (s.kind === 'stop') openBoard(s.stop);
            else {
              from.value = s.from;
              to.value = s.to;
              push({ kind: 'journeys' });
            }
          }}
        >
          <Icon name={favorites.has(s) ? 'star' : 'recent'} class="bn-row-ic" />
          <span class="bn-row-main">{s.kind === 'stop' ? s.stop.name : `${s.from.name} → ${s.to.name}`}<small>{s.kind === 'stop' ? 'Abfahrten' : 'Verbindung'}</small></span>
        </button>
      ))}
    </section>
  );
}
