import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { searchOpen } from '../../state/ui';
import { Icon } from '../../ui/icons/Icon';
import { Kbd } from '../../ui/Chip';
import { cx } from '../../ui/hooks';
import { localResults, placeResult } from './results';
import { placeQuery } from './tags';
import { searchPlaces, type Place, type Result, type ResultGroup } from './sources';
import './search.css';

export const ORDER: ResultGroup[] = ['Koordinate', 'Ebenen', 'Karten', 'Befehle', 'Orte'];
/** The tag that limits the search to a group (shown small behind the group name). */
const GROUP_TAG: Partial<Record<ResultGroup, string>> = { Orte: 'ort:', Ebenen: 'ebene:', Karten: 'karte:', Befehle: 'cmd:' };
const ORDER_COMMANDS_FIRST: ResultGroup[] = ['Koordinate', 'Befehle', 'Ebenen', 'Karten', 'Orte'];

/** Results in the order of their groups; a command that matches the query by its title goes before the layers. */
export const orderResults = (all: Result[]): Result[] => (all.some((r) => r.top) ? ORDER_COMMANDS_FIRST : ORDER).flatMap((g) => all.filter((r) => r.group === g));

export function usePlaces(q: string) {
  const [state, set] = useState<{ q: string; status: 'idle' | 'loading' | 'ok' | 'error'; places: Place[] }>({ q: '', status: 'idle', places: [] });
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      set({ q: query, status: 'idle', places: [] });
      return;
    }
    set((s) => ({ ...s, q: query, status: 'loading' }));
    const ctl = new AbortController();
    const id = setTimeout(() => {
      searchPlaces(query, ctl.signal).then(
        (places) => set({ q: query, status: 'ok', places }),
        (e) => e?.name !== 'AbortError' && set({ q: query, status: 'error', places: [] }),
      );
    }, 240);
    return () => {
      clearTimeout(id);
      ctl.abort();
    };
  }, [q]);
  return state;
}

/** Command palette: places, layers, Karten, coordinates and commands in one field. */
export function Search() {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const places = usePlaces(placeQuery(q));
  const close = () => (searchOpen.value = false);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => prev?.focus?.();
  }, []);

  // on-screen keyboard: iOS keeps the layout viewport and shrinks/scrolls only the visual one, so follow it
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement.style;
    const on = () => {
      root.setProperty('--vv-h', `${vv.height}px`);
      root.setProperty('--vv-top', `${vv.offsetTop}px`);
    };
    on();
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => {
      vv.removeEventListener('resize', on);
      vv.removeEventListener('scroll', on);
      root.removeProperty('--vv-h');
      root.removeProperty('--vv-top');
    };
  }, []);

  const results = useMemo(() => {
    const local = localResults(q);
    const ps = placeQuery(q).length >= 2 ? places.places.map(placeResult) : [];
    const all = [...local, ...ps];
    return orderResults(all);
  }, [q, places.places]);

  const a = Math.min(active, Math.max(0, results.length - 1));
  useEffect(() => list.current?.querySelector(`[data-i="${a}"]`)?.scrollIntoView({ block: 'nearest' }), [a, results]);

  const run = (r: Result | undefined) => {
    if (!r) return;
    close();
    r.run();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a + 1) % Math.max(1, results.length)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a - 1 + results.length) % Math.max(1, results.length)));
    else if (e.key === 'Enter') (e.preventDefault(), run(results[a]));
    else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), close());
    else if (e.key === 'Tab') e.preventDefault();
  };

  let last: ResultGroup | undefined;
  const rows = results.map((r, i) => {
    const head = r.group !== last ? <div class="sgroup" role="presentation">{r.group}{GROUP_TAG[r.group] && <span class="sgroup-tag">{GROUP_TAG[r.group]}</span>}</div> : null;
    last = r.group;
    return (
      <div key={r.id}>
        {head}
        <div
          id={`sr-${i}`}
          data-i={i}
          role="option"
          aria-selected={i === a}
          class={cx('srow', i === a && 'is-active')}
          onMouseMove={() => i !== a && setActive(i)}
          onClick={() => run(r)}
        >
          <span class="srow-icon" style={r.color ? { ['--c' as string]: r.color } : undefined}>
            <Icon name={r.icon} size={18} />
          </span>
          <span class="srow-text">
            <span class="srow-title">{r.title}</span>
            {r.subtitle && <span class="srow-sub">{r.subtitle}</span>}
          </span>
          {r.hint && <span class="srow-hint">{r.hint}</span>}
        </div>
      </div>
    );
  });

  const loadingPlaces = places.status === 'loading' && placeQuery(q).length >= 2;
  return (
    <div class="search-overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div class="search" role="dialog" aria-modal="true" aria-label="Suche">
        <div class="search-field">
          <Icon name="search" size={18} />
          <input
            ref={input}
            class="search-input"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-list"
            aria-activedescendant={results.length ? `sr-${a}` : undefined}
            aria-label="Ort, Ebene, Karte, Koordinate oder Befehl"
            placeholder="Ort, Ebene, Karte oder Koordinate"
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            enterkeyhint="go"
            value={q}
            onInput={(e) => {
              setQ((e.currentTarget as HTMLInputElement).value);
              setActive(0);
            }}
            onKeyDown={onKey}
          />
          {q ? (
            <button type="button" class="search-clear" aria-label="Eingabe löschen" onClick={() => (setQ(''), input.current?.focus())}>
              <Icon name="close" size={16} />
            </button>
          ) : (
            <Kbd keys="Esc" />
          )}
        </div>
        <div id="search-list" ref={list} class="search-list" role="listbox" aria-label="Ergebnisse">
          {rows}
          {loadingPlaces && <div class="sstatus">Orte werden gesucht</div>}
          {places.status === 'error' && <div class="sstatus is-error">Ortssuche nicht erreichbar. Ebenen, Karten und Befehle funktionieren weiter.</div>}
          {!results.length && !loadingPlaces && places.status !== 'error' && q.trim() && <div class="sstatus">Keine Treffer für „{q.trim()}“</div>}
        </div>
        <div class="search-foot" aria-hidden="true">
          <span>
            <Kbd keys="Up" /> <Kbd keys="Down" /> wählen
          </span>
          <span>
            <Kbd keys="Enter" /> ausführen
          </span>
        </div>
        <div class="sr-only" role="status" aria-live="polite">
          {results.length} Ergebnisse
        </div>
      </div>
    </div>
  );
}
