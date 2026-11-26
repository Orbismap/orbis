import { haversine } from '@/core/geo';
import { Icon } from '../ui/icons';
import { Chip, ErrorState, Row, SavedNote, Section, Skeleton, StopRow } from '../ui/parts';
import { Screen } from '../ui/Sheet';
import { isDesktop, menuOpen, panelOpen, useScene } from '../ui/scene';
import { DepartureRow } from '../ui/Departures';
import { distance } from '../ui/format';
import type { Stop } from '../data/types';
import { sources } from '../state/sources';
import { locationState, requestLocation } from '../state/location';
import { favorites, recents, savedKey, type Saved } from '../state/places';
import { from, openStop, origin, push, stack, to } from '../state/nav';
import { useAsync, useDepartures, useNow } from '../state/hooks';

/** Start: „Wohin?“, Schnellziele, Abfahrten der nächsten Haltestelle und Haltestellen in der Nähe. */
export function Start() {
  const o = origin.value;
  useScene(o ? { center: [o.lng, o.lat], zoom: 15.2 } : {});
  const shortcuts = [...favorites.list.value, ...recents.list.value.filter((r) => !favorites.has(r))].slice(0, 8);
  // am Desktop stehen Suche und Schnellziele im Menü, solange es offen ist
  const inMenu = isDesktop.value && menuOpen.value;

  return (
    <Screen
      label="Start"
      head={inMenu ? <h1 class="bn-title">In der Nähe</h1> : (
        <>
          <button type="button" class="bn-where" onClick={() => push({ kind: 'search', target: 'to' })}>
            <Icon name="search" size={22} /><span>Wohin möchtest du?</span>
          </button>
          {shortcuts.length > 0 && (
            <div class="bn-chips">
              {shortcuts.map((s) => <Chip key={savedKey(s)} icon={favorites.has(s) ? 'star' : 'recent'} onClick={() => openSaved(s)}>{savedLabel(s)}</Chip>)}
            </div>
          )}
        </>
      )}
    >
      {o ? <Nearby origin={o} /> : <LocateCard />}
    </Screen>
  );
}

export const savedLabel = (s: Saved) => (s.kind === 'stop' ? s.stop.name : `${s.from.name} → ${s.to.name}`);

/** Gemerktes öffnen: eine Haltestelle zeigt ihre Abfahrten, eine Strecke ihre Verbindungen. */
export function openSaved(s: Saved) {
  panelOpen.value = true;
  if (s.kind === 'stop') openStop(s.stop);
  else {
    from.value = s.from;
    to.value = s.to;
    // die offene Ergebnisliste folgt Start und Ziel von selbst
    if (stack.peek().at(-1)?.kind !== 'journeys') push({ kind: 'journeys' });
  }
}

function LocateCard() {
  const state = locationState.value;
  return (
    <div class="bn-card bn-locate">
      <b>{state === 'denied' ? 'Standort ist ausgeschaltet' : 'Was fährt bei dir?'}</b>
      <p>{state === 'denied' ? 'Erlaube den Standort in den Browser-Einstellungen oder suche eine Haltestelle.' : 'Mit deinem Standort siehst du Haltestellen und Abfahrten in der Nähe.'}</p>
      <div class="bn-actions">
        {state !== 'denied' && (
          <button type="button" class="bn-btn bn-btn-filled" disabled={state === 'asking'} onClick={() => void requestLocation()}>
            <Icon name="locate" size={18} />{state === 'asking' ? 'Suche Standort …' : 'Standort verwenden'}
          </button>
        )}
        <button type="button" class="bn-btn bn-btn-tonal" onClick={() => push({ kind: 'search', target: 'stop' })}>Haltestelle suchen</button>
      </div>
    </div>
  );
}

function Nearby({ origin: o }: { origin: Stop }) {
  const now = useNow();
  const stops = useAsync((signal) => sources.transit.nearbyStops(o.lat, o.lng, signal), [o.id]);
  const first = stops.data?.[0] ?? null;
  const dep = useDepartures(first, 8);
  if (stops.loading && !first) return <Skeleton />;
  if (!first) return stops.error ? <ErrorState message={stops.error} onRetry={stops.reload} /> : <ErrorState message="Keine Haltestelle in der Nähe gefunden." />;
  return (
    <>
      <Section
        title={`${first.name} · ${distance(haversine([o.lng, o.lat], [first.lng, first.lat]))}`}
        action={<button type="button" class="bn-link" onClick={() => openStop(first)}>Alle Abfahrten</button>}
      >
        {dep.saved && dep.updated && <SavedNote at={dep.updated} now={now} />}
        {dep.loading && dep.list.length === 0 && <Skeleton rows={3} />}
        {dep.error && dep.list.length === 0 && <ErrorState message={dep.error} />}
        {!dep.loading && !dep.error && dep.list.length === 0 && <p class="bn-note">In den nächsten Stunden fährt hier nichts.</p>}
        <div class="bn-list">{dep.list.slice(0, 4).map((d, i) => <DepartureRow key={`${d.line}${d.time.planned}${i}`} d={d} now={now} at={first} />)}</div>
      </Section>
      {stops.data!.length > 1 && (
        <Section title="Weitere Haltestellen">
          <div class="bn-list">{stops.data!.slice(1, 7).map((s) => <StopRow key={s.id} stop={s} from={o} onClick={() => openStop(s)} />)}</div>
        </Section>
      )}
      <div class="bn-list">
        <Row icon="swap" title="Verbindung suchen" subtitle="Start und Ziel wählen" onClick={() => push({ kind: 'search', target: 'to' })} />
      </div>
    </>
  );
}
