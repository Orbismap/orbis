import { Icon } from '../ui/icons';
import { Empty, ErrorState, Section, Skeleton, StopRow } from '../ui/parts';
import { Screen } from '../ui/Sheet';
import { useScene } from '../ui/scene';
import type { Stop } from '../data/types';
import { sources } from '../state/sources';
import { requestLocation } from '../state/location';
import { favorites, recents, type Saved } from '../state/places';
import { openStop, origin, push } from '../state/nav';
import { useAsync } from '../state/hooks';

const stopsOf = (list: Saved[]): Stop[] => list.flatMap((s) => (s.kind === 'stop' ? [s.stop] : []));

/** Reiter „Abfahrten“: eine Haltestelle wählen (Suche, gemerkt, in der Nähe oder auf der Karte). */
export function Stops() {
  const o = origin.value;
  const nearby = useAsync((signal) => (o ? sources.transit.nearbyStops(o.lat, o.lng, signal) : Promise.resolve([] as Stop[])), [o?.id]);
  useScene(o ? { center: [o.lng, o.lat], zoom: 15.5 } : {});
  const saved = stopsOf(favorites.list.value);
  const recent = stopsOf(recents.list.value).filter((s) => !saved.some((x) => x.id === s.id)).slice(0, 5);

  return (
    <Screen
      label="Abfahrten"
      head={
        <>
          <h1 class="bn-title">Abfahrten</h1>
          <button type="button" class="bn-where" onClick={() => push({ kind: 'search', target: 'stop' })}>
            <Icon name="search" size={22} /><span>Haltestelle suchen</span>
          </button>
        </>
      }
    >
      {saved.length > 0 && <Section title="Gemerkt"><div class="bn-list">{saved.map((s) => <StopRow key={s.id} stop={s} from={o} icon="star" onClick={() => openStop(s)} />)}</div></Section>}
      {o ? (
        <Section title="In der Nähe">
          {nearby.loading && !nearby.data?.length && <Skeleton />}
          {nearby.error && <ErrorState message={nearby.error} onRetry={nearby.reload} />}
          <div class="bn-list">{nearby.data?.slice(0, 15).map((s) => <StopRow key={s.id} stop={s} from={o} onClick={() => openStop(s)} />)}</div>
        </Section>
      ) : (
        <Empty icon="locate" title="Haltestellen in deiner Nähe" text="Oder tippe eine Haltestelle auf der Karte an." action={<button type="button" class="bn-btn bn-btn-filled" onClick={() => void requestLocation()}>Standort verwenden</button>} />
      )}
      {recent.length > 0 && <Section title="Zuletzt gesucht"><div class="bn-list">{recent.map((s) => <StopRow key={s.id} stop={s} from={o} icon="recent" onClick={() => openStop(s)} />)}</div></Section>}
    </Screen>
  );
}
