import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon, modeIcon } from '../ui/icons';
import type { Stop } from '../data/types';
import { sources } from '../state/sources';
import { myLocation, position } from '../state/location';
import { favorites, recents, type Saved } from '../state/places';
import { from, openBoard, origin, pop, replaceTop, to } from '../state/nav';

type Target = 'from' | 'to' | 'stop';
const TITLES: Record<Target, string> = { from: 'Start', to: 'Ziel', stop: 'Haltestelle' };

/** Gerätestandort als gewählten Start behandeln: `from` zurück auf null. */
function choose(target: Target, stop: Stop | null) {
  if (target === 'stop') {
    if (stop) openBoard(stop); // schließt auch die Suche
    else pop();
    return;
  }
  if (target === 'from') from.value = stop;
  else to.value = stop;
  if (stop) recents.add({ kind: 'stop', stop });
  // Sind Start und Ziel bekannt, ersetzt die Verbindungsliste die Suche; sonst geht es zurück.
  if (origin.value && to.value) replaceTop({ kind: 'journeys' });
  else pop();
}

export function SearchScreen({ target }: { target: Target }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Stop[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      setBusy(false);
      setFailed(false);
      return;
    }
    const ctl = new AbortController();
    setBusy(true);
    setFailed(false);
    const timer = setTimeout(() => {
      sources.transit.searchStops(text, ctl.signal).then(
        (list) => !ctl.signal.aborted && (setResults(list), setBusy(false)),
        () => !ctl.signal.aborted && (setResults([]), setBusy(false), setFailed(true)),
      );
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [query]);

  const stops = (items: Saved[]): Stop[] => items.flatMap((s) => (s.kind === 'stop' ? [s.stop] : []));
  const empty = query.trim().length < 2;
  const showMe = target === 'from' && !!position.value && empty;

  return (
    <div class="bn-screen bn-search">
      <div class="bn-searchbar">
        <button type="button" class="bn-iconbtn" aria-label="Zurück" onClick={pop}><Icon name="back" /></button>
        <input
          ref={input}
          class="bn-input"
          type="search"
          placeholder={`${TITLES[target]} suchen`}
          value={query}
          autocomplete="off"
          enterkeyhint="search"
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        {query && <button type="button" class="bn-iconbtn" aria-label="Leeren" onClick={() => setQuery('')}><Icon name="close" size={18} /></button>}
      </div>

      <div class="bn-list">
        {showMe && (
          <button type="button" class="bn-row" onClick={() => choose('from', null)}>
            <Icon name="locate" class="bn-row-ic" /><span class="bn-row-main">Mein Standort<small>{myLocation.value?.name}</small></span>
          </button>
        )}
        {empty && stops(favorites.list.value).length > 0 && <h2 class="bn-hd">Favoriten</h2>}
        {empty && stops(favorites.list.value).map((s) => <StopRow key={`f${s.id}`} stop={s} icon="star" onPick={() => choose(target, s)} />)}
        {empty && stops(recents.list.value).length > 0 && <h2 class="bn-hd">Zuletzt gesucht</h2>}
        {empty && stops(recents.list.value).map((s) => <StopRow key={`r${s.id}`} stop={s} icon="recent" onPick={() => choose(target, s)} />)}
        {!empty && busy && results.length === 0 && <p class="bn-note">Suche …</p>}
        {!empty && failed && <p class="bn-note bn-late">Die Suche ist gerade nicht erreichbar.</p>}
        {!empty && !busy && !failed && results.length === 0 && <p class="bn-note">Keine Haltestelle gefunden.</p>}
        {results.map((s) => <StopRow key={s.id} stop={s} icon="pin" onPick={() => choose(target, s)} />)}
      </div>
    </div>
  );
}

function StopRow({ stop, icon, onPick }: { stop: Stop; icon: 'star' | 'recent' | 'pin'; onPick: () => void }) {
  return (
    <button type="button" class="bn-row" onClick={onPick}>
      <Icon name={icon} class="bn-row-ic" />
      <span class="bn-row-main">{stop.name}{stop.area && <small>{stop.area}</small>}</span>
      {stop.modes && <span class="bn-row-modes">{stop.modes.slice(0, 4).map((m) => <Icon key={m} name={modeIcon(m)} size={16} />)}</span>}
    </button>
  );
}
