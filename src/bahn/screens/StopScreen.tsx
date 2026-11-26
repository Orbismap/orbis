import { Icon } from '../ui/icons';
import { Header, IconButton } from '../ui/parts';
import { Screen } from '../ui/Sheet';
import { useScene } from '../ui/scene';
import { DepartureList } from '../ui/Departures';
import type { Stop } from '../data/types';
import { favorites } from '../state/places';
import { from, openConnections, to } from '../state/nav';

/** Eine Haltestelle: Verbindungen von hier oder hierher, merken, die nächsten Abfahrten. */
export function StopScreen({ stop }: { stop: Stop }) {
  useScene({ stops: [{ stop, kind: 'selected' }], center: [stop.lng, stop.lat], zoom: 16 });
  const item = { kind: 'stop', stop } as const;
  const saved = favorites.has(item);

  return (
    <Screen
      label={stop.name}
      head={
        <>
          <Header
            title={stop.name}
            subtitle={stop.area ?? 'Haltestelle'}
            actions={<IconButton icon="star" label={saved ? 'Aus der Merkliste entfernen' : 'Merken'} pressed={saved} class={saved ? 'bn-starred' : ''} onClick={() => favorites.toggle(item)} />}
          />
          <div class="bn-actions">
            <button type="button" class="bn-btn bn-btn-tonal" onClick={() => { from.value = stop; if (to.peek()?.id === stop.id) to.value = null; openConnections(); }}>
              <span class="bn-dot" aria-hidden="true" />Von hier
            </button>
            <button type="button" class="bn-btn bn-btn-filled" onClick={() => { to.value = stop; if (from.peek()?.id === stop.id) from.value = null; openConnections(); }}>
              <Icon name="pin" size={18} />Hierher
            </button>
          </div>
        </>
      }
    >
      <DepartureList stop={stop} />
    </Screen>
  );
}
