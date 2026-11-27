import { Empty, IconButton, Row, Section } from '../ui/parts';
import { Screen } from '../ui/Sheet';
import { favorites, savedKey, type Saved as Item } from '../state/places';
import { push } from '../state/nav';
import { openSaved, savedLabel } from './Start';
import { currentRun, daysText, rides, type SavedTrip } from '../data/savedTrips';
import { trips } from '../state/trips';
import { useNow } from '../state/hooks';
import { clock, delayState } from '../ui/format';

const dayLabel = (t: number) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(t);

function TripRow({ trip, now }: { trip: SavedTrip; now: number }) {
  const run = currentRun(trip, now);
  const j = run.journey;
  const list = rides(j);
  const first = list[0] ?? j.legs[0]!;
  const last = list[list.length - 1] ?? first;
  const cancelled = j.legs.some((l) => l.cancelled);
  const late = delayState(j.departure) === 'late' || delayState(j.arrival) === 'late';
  return (
    <Row
      icon={trip.commute ? 'swap' : 'star'}
      title={`${first.from.name} → ${last.to.name}`}
      subtitle={[
        `${clock(j.departure.planned)}–${clock(j.arrival.planned)}`,
        trip.commute ? daysText(trip.commute.days) : dayLabel(j.departure.planned),
        list.map((l) => l.line).join(', '),
        trip.notify ? 'Nachricht an' : '',
      ].filter(Boolean).join(' · ')}
      after={cancelled ? <span class="bn-tag bn-tag-late">Fällt aus</span> : late ? <span class="bn-tag bn-tag-late">verspätet</span> : run.past ? <span class="bn-tag">vorbei</span> : null}
      onClick={() => push({ kind: 'saved', id: trip.id })}
    />
  );
}

/** Merkliste: Pendlerstrecken, gespeicherte Verbindungen, gemerkte Strecken und Haltestellen. */
export function Saved() {
  const now = useNow();
  const all = trips.value;
  const next = (t: SavedTrip) => currentRun(t, now).journey.departure.planned;
  const bySoonest = [...all].sort((a, b) => next(a) - next(b));
  const commutes = bySoonest.filter((t) => t.commute);
  const singles = bySoonest.filter((t) => !t.commute);
  const tripGroup = (title: string, list: SavedTrip[]) => list.length > 0 && (
    <Section title={title}>
      <div class="bn-list">{list.map((t) => <TripRow key={t.id} trip={t} now={now} />)}</div>
    </Section>
  );
  const items = favorites.list.value;
  const routes = items.filter((s) => s.kind === 'route');
  const stops = items.filter((s) => s.kind === 'stop');
  const group = (title: string, list: Item[]) => list.length > 0 && (
    <Section title={title}>
      <div class="bn-list">
        {list.map((s) => (
          <div class="bn-split" key={savedKey(s)}>
            <Row icon={s.kind === 'stop' ? 'pin' : 'swap'} title={savedLabel(s)} subtitle={s.kind === 'stop' ? s.stop.area : 'Verbindungen anzeigen'} onClick={() => openSaved(s)} />
            <IconButton icon="close" label={`${savedLabel(s)} entfernen`} onClick={() => favorites.remove(s)} />
          </div>
        ))}
      </div>
    </Section>
  );

  return (
    <Screen label="Merkliste" head={<h1 class="bn-title">Merkliste</h1>}>
      {tripGroup('Pendlerstrecken', commutes)}
      {tripGroup('Gespeicherte Verbindungen', singles)}
      {items.length === 0 && all.length === 0 && (
        <Empty
          icon="star" title="Noch nichts gemerkt" text="Merke dir Haltestellen und Strecken mit dem Stern. Eine Verbindung öffnest du und tippst auf „Offline speichern“."
          action={<button type="button" class="bn-btn bn-btn-filled" onClick={() => push({ kind: 'search', target: 'stop' })}>Haltestelle suchen</button>}
        />
      )}
      {group('Strecken', routes)}
      {group('Haltestellen', stops)}
    </Screen>
  );
}
