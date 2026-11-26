// The lower half: one big arrow to the target, how far it is and what it is. Before that: what is still missing.
import { computed } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { formatDistance } from '@/features/routes/osrm';
import { isThere, unwrap } from '../data/guide';
import { metres } from '../data/places';
import { chosen, kind, retry, search, searchRadius, target, way } from '../state/finder';
import { compass, heading, manual, position, positionState, startCompass } from '../state/sensors';
import { openSearch, useMyPosition } from '../state/ui';

/** The turn of the arrow, continuous so that it never spins the long way round. */
let turned = 0;
const arrow = computed(() => {
  const w = way.value;
  if (w) turned = unwrap(turned, w.bearing - (heading.value ?? 0));
  return turned;
});

const SearchButton = ({ label = 'Ort suchen' }: { label?: string }) => (
  <button type="button" class="find-button find-quiet" onClick={openSearch}>{label}</button>
);

/** While a searched place stands in for the position: where one starts, and the ways out. */
function Elsewhere() {
  if (manual.value === null) return null;
  return (
    <>
      <p class="find-hint">Start: {manual.value}</p>
      <div class="find-actions">
        <SearchButton label="Anderer Ort" />
        <button type="button" class="find-button find-quiet" onClick={useMyPosition}>Mein Standort</button>
      </div>
    </>
  );
}

/** `search`: offer the place search as the second way. */
function Notice({ title, text, action, onAction, search: second }: { title: string; text?: string; action?: string; onAction?: () => void; search?: boolean }) {
  return (
    <>
      <h1 class="find-title">{title}</h1>
      {text && <p class="find-text">{text}</p>}
      <div class="find-actions">
        {action && <button type="button" class="find-button" onClick={onAction}>{action}</button>}
        {second && <SearchButton />}
      </div>
      <Elsewhere />
    </>
  );
}

function content(): ComponentChildren {
  const state = positionState.value;
  if (state === 'off') return <Notice title="Orbis Find" text={`Findet ${kind.value.next}.`} action="Los geht’s" onAction={useMyPosition} search />;
  if (state === 'denied') return <Notice title="Kein Zugriff auf den Standort" text="Erlaube ihn in den Einstellungen deines Browsers und versuche es noch einmal." action="Erneut versuchen" onAction={useMyPosition} search />;
  if (state === 'unavailable') return <Notice title="Standort nicht verfügbar" text="Prüfe, ob die Ortung deines Geräts eingeschaltet ist." action="Erneut versuchen" onAction={useMyPosition} search />;
  const here = position.value;
  if (!here) return <Notice title="Standort wird gesucht …" search />;

  const to = target.value, w = way.value;
  if (!to || !w) {
    if (search.value === 'error') return <Notice title="Daten nicht ladbar" text="Prüfe deine Verbindung." action="Erneut versuchen" onAction={retry} />;
    if (search.value !== 'ready') return <Notice title="Suche in der Nähe …" />;
    return <Notice title="Nichts in der Nähe" text={`${kind.value.none} im Umkreis von ${formatDistance(searchRadius.value)}.`} />;
  }

  // a searched place is not where one is: nobody arrives from there
  const arrived = manual.value === null && isThere(metres([here.lng, here.lat], [to.lng, to.lat]), here.accuracy);
  return (
    <>
      <svg class={arrived ? 'find-arrow find-arrived' : 'find-arrow'} viewBox="0 0 100 100" role="img" aria-label={arrived ? 'Angekommen' : 'Richtung zum Ziel'}>
        {arrived
          ? <path d="M20 53 42 74 81 30" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
          : <path d="M50 6 86 88 50 70 14 88Z" fill="currentColor" stroke="currentColor" stroke-width="6" stroke-linejoin="round" style={{ transform: `rotate(${arrow.value}deg)`, transformOrigin: '50px 50px' }} />}
      </svg>
      <p class="find-distance">{arrived ? 'Du bist da' : formatDistance(w.distance)}</p>
      <p class="find-name">{to.title}</p>
      {to.detail && <p class="find-text">{to.detail}</p>}
      {!arrived && compass.value !== 'on' && (
        <p class="find-hint">{heading.value === null ? 'Ohne Kompass zeigt der Pfeil die Richtung auf der Karte, oben ist Norden.' : 'Ohne Kompass gilt der Pfeil in Fahrtrichtung.'}</p>
      )}
      <div class="find-actions">
        {compass.value === 'ask' && <button type="button" class="find-button" onClick={() => void startCompass()}>Kompass einschalten</button>}
        {chosen.value && <button type="button" class="find-button find-quiet" onClick={() => (chosen.value = null)}>Zum nächsten Ziel</button>}
      </div>
      <Elsewhere />
    </>
  );
}

export function Guide() {
  return <section class="find-guide" aria-live="polite">{content()}</section>;
}
