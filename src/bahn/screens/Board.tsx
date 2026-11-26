import { useState } from 'preact/hooks';
import { formatAge } from '@/core/format';
import { Icon } from '../ui/icons';
import { SavedNote } from '../ui/SavedNote';
import { BoardRow } from '../ui/Departures';
import type { ModeGroup } from '../data/types';
import { favorites } from '../state/places';
import { boardStop, push } from '../state/nav';
import { useDepartures, useNow } from '../state/hooks';
import { useScene } from '../ui/scene';

const FILTERS: { id: string; label: string; modes: ModeGroup[] }[] = [
  { id: 'all', label: 'Alle', modes: [] },
  { id: 'fern', label: 'Fern', modes: ['fern', 'fernbus'] },
  { id: 'regio', label: 'Regio', modes: ['regio'] },
  { id: 'sbahn', label: 'S-Bahn', modes: ['sbahn'] },
  { id: 'nah', label: 'U/Tram/Bus', modes: ['ubahn', 'tram', 'bus'] },
];

/** Abfahrtstafel einer Haltestelle. */
export function Board() {
  const stop = boardStop.value;
  const [filter, setFilter] = useState('all');
  const now = useNow(15_000);
  const { list, loading, error, updated, saved: kept } = useDepartures(stop, 40);
  useScene(stop ? { center: [stop.lng, stop.lat], zoom: 15, markers: [{ id: stop.id, lng: stop.lng, lat: stop.lat, kind: 'selected' }] } : {});

  if (!stop) {
    return (
      <div class="bn-page">
        <h1 class="bn-title">Abfahrten</h1>
        <p class="bn-note">Wähle eine Haltestelle, um die Abfahrten zu sehen.</p>
        <button type="button" class="bn-cta" onClick={() => push({ kind: 'search', target: 'stop' })}>Haltestelle suchen</button>
      </div>
    );
  }

  const active = FILTERS.find((f) => f.id === filter)!;
  const shown = list.filter((d) => !active.modes.length || active.modes.includes(d.mode));
  const saved = favorites.has({ kind: 'stop', stop });
  const status = updated && !kept ? `Aktualisiert ${formatAge(updated, now)}` : loading ? 'Lädt …' : '';

  return (
    <div class="bn-page">
      <div class="bn-boardhead">
        <button type="button" class="bn-boardname" onClick={() => push({ kind: 'search', target: 'stop' })}>
          {stop.name}<Icon name="chevron" size={18} />
        </button>
        <button type="button" class={`bn-iconbtn ${saved ? 'bn-starred' : ''}`} aria-label={saved ? 'Aus Favoriten entfernen' : 'Zu Favoriten'} aria-pressed={saved} onClick={() => favorites.toggle({ kind: 'stop', stop })}>
          <Icon name="star" />
        </button>
      </div>
      <p class="bn-small">{[status, stop.area].filter(Boolean).join(' · ')}</p>
      {kept && updated && <SavedNote at={updated} now={now} />}
      <div class="bn-pills bn-scrollx">
        {FILTERS.map((f) => <button key={f.id} type="button" class="bn-pill" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>
      {loading && list.length === 0 && <p class="bn-note">Lädt …</p>}
      {error && <p class="bn-note bn-late">{error}</p>}
      {!loading && (!error || kept) && shown.length === 0 && <p class="bn-note">{kept ? 'Keine gespeicherten Abfahrten mehr.' : 'Keine Abfahrten in den nächsten Stunden.'}</p>}
      <div class="bn-board">
        {shown.map((d, i) => <BoardRow key={`${d.line}${d.time.planned}${i}`} d={d} />)}
      </div>
    </div>
  );
}
