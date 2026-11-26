import { useState } from 'preact/hooks';
import { haversine } from '@/core/geo';
import { Icon } from '../ui/icons';
import { NetMap, type MapMarker } from '../ui/NetMap';
import { DepartureRow } from '../ui/Departures';
import { distance } from '../ui/format';
import type { Stop } from '../data/types';
import { sources } from '../state/sources';
import { position, requestLocation } from '../state/location';
import { openBoard, origin, push } from '../state/nav';
import { useAsync, useDepartures, useNow } from '../state/hooks';

/** Karten-Reiter: Haltestellen um den Standort, Antippen zeigt die nächsten Abfahrten. */
export function MapTab() {
  const o = origin.value;
  const stops = useAsync((signal) => (o ? sources.transit.nearbyStops(o.lat, o.lng, signal) : Promise.resolve([] as Stop[])), [o?.id]);
  const [selected, setSelected] = useState<Stop | null>(null);
  const list = stops.data ?? [];
  const markers: MapMarker[] = list.slice(0, 25).map((s) => ({ id: s.id, lng: s.lng, lat: s.lat, kind: s.id === selected?.id ? 'selected' : 'stop' }));
  const active = selected ?? null;

  return (
    <div class="bn-mapscreen">
      <NetMap
        center={o ? [o.lng, o.lat] : [10.4, 51.1]}
        zoom={o ? 15 : 5.2}
        me={position.value ? [position.value.lng, position.value.lat] : null}
        markers={markers}
        onMarker={(id) => setSelected(list.find((s) => s.id === id) ?? null)}
      />
      <button type="button" class="bn-searchpill" onClick={() => push({ kind: 'search', target: 'stop' })}>
        <Icon name="search" size={18} />Haltestelle oder Linie suchen
      </button>
      {!o && (
        <button type="button" class="bn-fab" aria-label="Standort verwenden" onClick={() => void requestLocation()}><Icon name="locate" /></button>
      )}
      {active && <StopCard stop={active} from={o} onClose={() => setSelected(null)} />}
    </div>
  );
}

function StopCard({ stop, from, onClose }: { stop: Stop; from: Stop | null; onClose: () => void }) {
  const now = useNow();
  const { list } = useDepartures(stop, 6);
  return (
    <div class="bn-stopcard">
      <div class="bn-between">
        <h3>{stop.name}</h3>
        <button type="button" class="bn-iconbtn" aria-label="Schließen" onClick={onClose}><Icon name="close" size={18} /></button>
      </div>
      <div class="bn-small">{stop.area ?? 'Haltestelle'}{from ? ` · ${distance(haversine([from.lng, from.lat], [stop.lng, stop.lat]))}` : ''}</div>
      {list.slice(0, 3).map((d, i) => <DepartureRow key={i} d={d} now={now} />)}
      <button type="button" class="bn-cta" onClick={() => openBoard(stop)}>Alle Abfahrten</button>
    </div>
  );
}
