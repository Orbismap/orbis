// Entering a new object: above, the map is moved under a pin that stays in the middle; below, what one knows about it.
import { effect } from '@preact/signals';
import type { Marker } from 'maplibre-gl';
import { formatDistance } from '@/features/routes/osrm';
import { Icon } from '@/ui/icons/Icon';
import { DOUBLE_M, nearestOf, withinReach } from '../data/osmEdit';
import type { Field } from '../data/kinds';
import { metres } from '../data/places';
import { draft, existing, lookAround, moveDraft, sending, setValue, stopAdding, submit } from '../state/add';
import { kind } from '../state/finder';
import { clientId, isTest, redirectUri, server, token } from '../state/osm';
import { position, positionState } from '../state/sensors';
import { useMyPosition } from '../state/ui';
import { PictureTile } from './PictureTile';
import { meElement, setData, useMap } from './useMap';

/** Close enough to place something to the metre. */
const ZOOM = 19;

function PlaceMap() {
  const start = draft.peek()!;
  const { host, failed } = useMap({ center: [start.lng, start.lat], zoom: ZOOM, maxZoom: 20.5 }, (ml, m, cleanup) => {
    m.on('move', () => {
      const c = m.getCenter();
      moveDraft([c.lng, c.lat]);
    });
    m.on('moveend', () => lookAround());
    lookAround();
    cleanup.push(effect(() => setData(m, 'found', existing.value.list.map((e) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lng, e.lat] }, properties: { target: false } })))));
    let me: Marker | undefined;
    cleanup.push(effect(() => {
      const p = position.value;
      if (p) (me ??= new ml.Marker({ element: meElement() }).setLngLat([p.lng, p.lat]).addTo(m)).setLngLat([p.lng, p.lat]);
    }));
  });

  return (
    <section class="find-map" aria-label="Karte zum Platzieren">
      <div ref={host} class="find-map-canvas" />
      {failed
        ? <p class="find-map-failed" role="status">Ohne Karte lässt sich nichts platzieren.</p>
        : (
          <svg class="find-pin" width="40" height="52" viewBox="0 0 40 52" aria-hidden="true">
            <path d="M20 50C20 50 4 31 4 18a16 16 0 0 1 32 0c0 13-16 32-16 32Z" />
            <circle cx="20" cy="18" r="6" />
          </svg>
        )}
    </section>
  );
}

/** What stands between the draft and sending it, in words; `blocked` while nothing may be sent. */
function check(): { text: string; blocked: boolean; warn?: boolean; reload?: boolean; locate?: boolean } {
  const d = draft.value!, here = position.value, around = existing.value;
  if (!here) return { text: positionState.value === 'asking' ? 'Standort wird gesucht …' : 'Zum Eintragen brauche ich deinen Standort.', blocked: true, locate: positionState.value !== 'asking' };
  const away = metres([here.lng, here.lat], [d.lng, d.lat]);
  if (!withinReach(away, here.accuracy)) return { text: `Zu weit weg (${formatDistance(away)}). Trag nur ein, was du vor dir siehst.`, blocked: true, warn: true };
  if (around.state === 'loading') return { text: 'Prüfe, was schon eingetragen ist …', blocked: true };
  if (around.state === 'error') return { text: 'Vorhandene Einträge nicht ladbar.', blocked: true, reload: true };
  const near = nearestOf(around.list, [d.lng, d.lat]);
  if (near <= DOUBLE_M) return { text: 'Hier ist schon einer eingetragen (grauer Punkt). Nur eintragen, wenn es ein weiterer ist.', blocked: false, warn: true };
  return { text: 'Schieb die Karte, bis die Nadel genau auf der Stelle steht.', blocked: false };
}

function Done({ id }: { id: number }) {
  return (
    <section class="find-guide" role="status">
      <h1 class="find-title">Eingetragen</h1>
      <p class="find-text">{isTest ? 'Gespeichert in der Testkarte von OpenStreetMap.' : 'Danke! Der Eintrag steht jetzt in OpenStreetMap. Für andere erscheint er in Find mit dem nächsten Monatsauszug.'}</p>
      <p class="find-hint"><a href={`${server.web}/node/${id}`} target="_blank" rel="noopener">Eintrag ansehen</a></p>
      <div class="find-actions"><button type="button" class="find-button" onClick={stopAdding}>Fertig</button></div>
    </section>
  );
}

/** The answers of a field, as pictures where it has them. A second tap takes an answer back: what one does not know stays out. */
function Choices({ field, chosen }: { field: Field; chosen?: string }) {
  const tap = (value: string) => setValue(field.key, chosen === value ? '' : value);
  const { pictures } = field;
  if (pictures) {
    return (
      <div class="find-pictures">
        {field.options!.map(([value, label]) => <PictureTile key={value} art={pictures.art[value]!} colour={pictures.colour} name={label} selected={chosen === value} onClick={() => tap(value)} />)}
      </div>
    );
  }
  return <>{field.options!.map(([value, label]) => <button key={value} type="button" class="find-chip" aria-pressed={chosen === value} onClick={() => tap(value)}>{label}</button>)}</>;
}

function Form() {
  const add = kind.add!, d = draft.value!, send = sending.value;
  const state = check();
  const busy = send.state === 'sending';
  // the sign-in only returns to an address OpenStreetMap accepts: over plain HTTP that is 127.0.0.1, not localhost
  const elsewhere = window.location.hostname === 'localhost' ? window.location.href.replace('//localhost', '//127.0.0.1') : null;
  const double = !state.blocked && state.warn;
  return (
    <section class="find-guide find-add">
      <h1 class="find-title">{add.title}</h1>
      {isTest && <p class="find-test">Testkarte: Nichts landet in der echten OpenStreetMap.</p>}
      <p class={state.warn ? 'find-hint find-warn' : 'find-hint'} role="status">{state.text}</p>
      {state.reload && <button type="button" class="find-button find-quiet" onClick={() => lookAround(true)}>Erneut laden</button>}
      {state.locate && <button type="button" class="find-button find-quiet" onClick={useMyPosition}>Standort verwenden</button>}

      {add.fields.map((field) => (
        <fieldset key={field.key} class="find-field">
          <legend>{field.label}</legend>
          {field.options ? <Choices field={field} chosen={d.values[field.key]} /> : (
            <input type="number" inputMode="numeric" min="1" max="999" aria-label={field.label} placeholder="?" value={d.values[field.key] ?? ''}
              onInput={(e) => setValue(field.key, e.currentTarget.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 3))} />
          )}
        </fieldset>
      ))}

      <div class="find-send">
        {send.state === 'error' && <p class="find-hint find-warn" role="alert">{send.text}</p>}
        {!clientId && <p class="find-hint find-warn">Noch nicht eingerichtet: Es fehlt die Kennung der OAuth-Anwendung. Rücksprungadresse: {redirectUri()}</p>}
        {clientId && !token.value && elsewhere && <p class="find-hint">Anmelden geht hier nur über <a href={elsewhere}>127.0.0.1</a>.</p>}
        <p class="find-hint">Der Eintrag ist öffentlich und steht unter deinem OSM-Namen.</p>
        <div class="find-actions">
          <button type="button" class="find-button find-quiet" onClick={stopAdding}>Abbrechen</button>
          {token.value
            ? <button type="button" class="find-button" disabled={busy || state.blocked} onClick={() => void submit()}><Icon name="check" size={16} /> {busy ? 'Wird gesendet …' : double ? 'Trotzdem eintragen' : 'Eintragen'}</button>
            : <button type="button" class="find-button" disabled={busy || !clientId || !!elsewhere} onClick={() => void submit()}>Bei OpenStreetMap anmelden</button>}
        </div>
      </div>
    </section>
  );
}

export function AddView() {
  const send = sending.value;
  return (
    <>
      <PlaceMap />
      {send.state === 'done' ? <Done id={send.id} /> : <Form />}
    </>
  );
}
