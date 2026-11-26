// Phones: the search lives in the sheet — its field in the bar at the bottom, its results as the page above the list.
import { batch, signal } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { history } from '../../state/history';
import { newRoute } from '../../state/routes';
import { showView } from '../../state/sheet-view';
import { orteView } from '../../state/hud';
import { searchOpen } from '../../state/ui';
import { IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons/Icon';
import { localResults, placeResult } from './results';
import { orderResults, usePlaces } from './Search';
import { placeQuery } from './tags';
import type { Result } from './sources';
import './search.css';

export const searchQuery = signal('');
/** What "Suchen" on the keyboard runs: the first result on screen. */
let first: Result | undefined;

const close = () => (searchOpen.value = false);
/** Closes the search and runs the result, as one change: the sheet goes straight to what it opens. */
const run = (r: Result) => batch(() => (close(), r.run()));

/** The search field. At rest it stands beside the settings, while searching beside "Abbrechen". */
export function SearchBar() {
  const open = searchOpen.value;
  const q = searchQuery.value;
  const input = useRef<HTMLInputElement>(null);
  const was = useRef(false);
  useEffect(() => {
    if (open) {
      // opened from elsewhere (a shortcut, a command): the field takes the focus
      if (document.activeElement !== input.current) input.current?.focus({ preventScroll: true });
    } else if (was.current) {
      searchQuery.value = '';
      input.current?.blur();
    }
    was.current = open;
  }, [open]);
  return (
    <form
      class="sbar"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (first) run(first);
      }}
    >
      <label class="sbar-field">
        <Icon name="search" size={18} />
        <input
          ref={input}
          class="sbar-input"
          type="search"
          aria-label="Ort, Ebene, Karte oder Koordinate suchen"
          placeholder="Ort oder Ebene suchen"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          enterkeyhint="search"
          value={q}
          // on focus, not on click: iOS only brings up the keyboard for the field the finger is on
          onFocus={() => (searchOpen.value = true)}
          onInput={(e) => batch(() => ((searchQuery.value = e.currentTarget.value), (searchOpen.value = true)))}
          onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), close())}
        />
        {open && q && (
          <button type="button" class="sbar-clear" aria-label="Eingabe löschen" onClick={() => ((searchQuery.value = ''), input.current?.focus())}>
            <Icon name="close" size={16} />
          </button>
        )}
      </label>
      {open ? (
        <button type="button" class="sbar-cancel" onClick={close}>
          Abbrechen
        </button>
      ) : (
        <IconButton icon="settings" label="Einstellungen" class="sbar-settings" onClick={() => showView('settings')} />
      )}
    </form>
  );
}

function Rows({ rows }: { rows: Result[] }) {
  return (
    <ul class="sheet-results" role="list">
      {rows.map((r) => (
        <li key={r.id}>
          <button type="button" class="srow" onClick={() => run(r)}>
            <span class="srow-icon" style={r.color ? { ['--c' as string]: r.color } : undefined}>
              <Icon name={r.icon} size={18} />
            </span>
            <span class="srow-text">
              <span class="srow-title">{r.title}</span>
              {r.subtitle && <span class="srow-sub">{r.subtitle}</span>}
            </span>
            {r.hint && <span class="srow-hint">{r.hint}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

const SUGGESTIONS: Result[] = [
  { id: 's:route', group: 'Befehle', icon: 'route', title: 'Route planen', run: newRoute },
  { id: 's:places', group: 'Befehle', icon: 'bookmark', title: 'Gespeicherte Orte', run: () => (orteView.value = 'places') },
  { id: 's:catalog', group: 'Befehle', icon: 'layers', title: 'Ebene hinzufügen', run: () => showView('catalog') },
];

/** Before typing: what was searched lately, and the ways in that need no word. */
function Start() {
  const recent = history.value
    .filter((e) => e.kind === 'search' && e.lng !== undefined && e.lat !== undefined)
    .slice(0, 5)
    .map((e) => placeResult({ id: e.key.slice(2), title: e.title, subtitle: e.sub === 'Suche' ? '' : (e.sub ?? ''), lng: e.lng!, lat: e.lat!, bounds: e.bounds, kind: e.placeKind }));
  first = undefined;
  return (
    <>
      {recent.length > 0 && (
        <>
          <h3 class="sgroup">Zuletzt gesucht</h3>
          <Rows rows={recent} />
        </>
      )}
      <h3 class="sgroup">Vorschläge</h3>
      <Rows rows={SUGGESTIONS} />
    </>
  );
}

function Found({ q }: { q: string }) {
  const places = usePlaces(placeQuery(q));
  const results = useMemo(() => {
    const found = placeQuery(q).length >= 2 ? places.places.map(placeResult) : [];
    return orderResults([...localResults(q), ...found]);
  }, [q, places.places]);
  first = results[0];
  const loading = places.status === 'loading' && placeQuery(q).length >= 2;
  let last = '';
  const groups: { name: string; rows: Result[] }[] = [];
  for (const r of results) {
    if (r.group !== last) groups.push({ name: (last = r.group), rows: [] });
    groups[groups.length - 1]!.rows.push(r);
  }
  return (
    <>
      {groups.map((g) => (
        <div key={g.name}>
          <h3 class="sgroup">{g.name}</h3>
          <Rows rows={g.rows} />
        </div>
      ))}
      {loading && <div class="sstatus">Orte werden gesucht</div>}
      {places.status === 'error' && <div class="sstatus is-error">Ortssuche nicht erreichbar. Ebenen und Karten funktionieren weiter.</div>}
      {!results.length && !loading && places.status !== 'error' && <div class="sstatus">Keine Treffer für „{q}“</div>}
      <div class="sr-only" role="status" aria-live="polite">
        {results.length} Ergebnisse
      </div>
    </>
  );
}

export function SearchResults() {
  const q = searchQuery.value.trim();
  return <div class="sheet-search">{q ? <Found q={q} /> : <Start />}</div>;
}
