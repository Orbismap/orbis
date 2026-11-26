import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons';
import { Empty, ErrorState, IconButton, Row, Section, Skeleton, StopRow } from '../ui/parts';
import { Screen } from '../ui/Sheet';
import { useScene } from '../ui/scene';
import type { Stop } from '../data/types';
import { sources } from '../state/sources';
import { position } from '../state/location';
import { favorites, recents, type Saved } from '../state/places';
import { from, openStop, origin, pop, replaceTop, stack, to } from '../state/nav';

type Target = 'from' | 'to' | 'stop';
const PROMPTS: Record<Target, string> = { from: 'Von wo?', to: 'Wohin?', stop: 'Haltestelle suchen' };

/** Eine Wahl übernehmen. `stop` null steht beim Start für den Gerätestandort. */
function choose(target: Target, stop: Stop | null) {
  if (stop) recents.add({ kind: 'stop', stop });
  if (target === 'stop') {
    if (stop) openStop(stop); // ersetzt die Suche
    else pop();
    return;
  }
  if (target === 'from') from.value = stop;
  else to.value = stop;
  // Liegt die Verbindungsliste darunter, reicht Zurück. Sonst weiter: zum fehlenden Ende oder zu den Verbindungen.
  if (stack.peek().at(-2)?.kind === 'journeys') pop();
  else if (!origin.value) replaceTop({ kind: 'search', target: 'from' });
  else if (!to.value) replaceTop({ kind: 'search', target: 'to' });
  else replaceTop({ kind: 'journeys' });
}

export function SearchScreen({ target }: { target: Target }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Stop[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // erst nach dem Einblenden: sonst schiebt die Tastatur die Seite
  useEffect(() => input.current?.focus({ preventScroll: true }), []);

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

  useScene({});
  const stops = (items: Saved[]): Stop[] => items.flatMap((x) => (x.kind === 'stop' ? [x.stop] : []));
  const empty = query.trim().length < 2;
  const showMe = target === 'from' && !!position.value && empty;
  const starred = stops(favorites.list.value);
  const recent = stops(recents.list.value).filter((x) => !starred.some((f) => f.id === x.id));
  const list = (items: Stop[], icon: 'star' | 'recent' | 'pin') => (
    <div class="bn-list">{items.map((x) => <StopRow key={`${icon}${x.id}`} stop={x} from={origin.value} icon={icon} onClick={() => choose(target, x)} />)}</div>
  );

  return (
    <Screen
      label={PROMPTS[target]} rest="full"
      head={
        <div class="bn-searchbar">
          <IconButton icon="back" label="Zurück" onClick={pop} />
          <input
            ref={input} class="bn-input" type="search" placeholder={PROMPTS[target]} aria-label={PROMPTS[target]}
            value={query} autocomplete="off" enterkeyhint="search" onInput={(e) => setQuery(e.currentTarget.value)}
          />
          {query && <IconButton icon="close" label="Eingabe löschen" onClick={() => { setQuery(''); input.current?.focus(); }} />}
        </div>
      }
    >
      {showMe && <div class="bn-list"><Row icon="locate" title="Mein Standort" onClick={() => choose('from', null)} /></div>}
      {empty && starred.length > 0 && <Section title="Gemerkt">{list(starred, 'star')}</Section>}
      {empty && recent.length > 0 && <Section title="Zuletzt gesucht">{list(recent, 'recent')}</Section>}
      {empty && !showMe && !starred.length && !recent.length && <Empty icon="search" title="Haltestelle eingeben" text="Zum Beispiel „Hamburg Hbf“ oder der Name deiner Bushaltestelle." />}
      {!empty && busy && results.length === 0 && <Skeleton />}
      {!empty && failed && <ErrorState message="Die Suche ist gerade nicht erreichbar." />}
      {!empty && !busy && !failed && results.length === 0 && <Empty icon="search" title="Keine Haltestelle gefunden" text="Prüfe die Schreibweise oder ergänze den Ort." />}
      {!empty && list(results, 'pin')}
      {!empty && results.length > 0 && <p class="bn-note"><Icon name="pin" size={14} /> Haltestellen lassen sich auch auf der Karte antippen.</p>}
    </Screen>
  );
}
