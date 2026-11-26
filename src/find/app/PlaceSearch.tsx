// Search for a place to start from, for when the position is not available or one wants to look somewhere else. Full screen, so
// that the keyboard does not cover it. Same geocoder as the search of the map.
import { useEffect, useRef, useState } from 'preact/hooks';
import { coordinateLabel, parseCoordinate, searchPlaces, type Place } from '@/features/search/sources';

/** Wait this long after the last key before asking. */
const PAUSE_MS = 350;

type Found = { status: 'idle' | 'loading' | 'error' } | { status: 'ok'; places: Place[] };

export function PlaceSearch({ onPick, onClose }: { onPick(place: Place): void; onClose(): void }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found>({ status: 'idle' });
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const q = query.trim();
    const coordinate = parseCoordinate(q);
    if (coordinate) {
      setFound({ status: 'ok', places: [{ id: q, title: coordinateLabel(coordinate), subtitle: 'Koordinate', ...coordinate }] });
      return;
    }
    if (q.length < 3) {
      setFound({ status: 'idle' });
      return;
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      setFound({ status: 'loading' });
      searchPlaces(q, ctl.signal).then(
        (places) => { if (!ctl.signal.aborted) setFound({ status: 'ok', places }); },
        () => { if (!ctl.signal.aborted) setFound({ status: 'error' }); },
      );
    }, PAUSE_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [query]);

  const first = found.status === 'ok' ? found.places[0] : undefined;
  return (
    <div class="find-search" role="dialog" aria-modal="true" aria-label="Ort suchen" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <form class="find-search-bar" role="search" onSubmit={(e) => { e.preventDefault(); if (first) onPick(first); }}>
        <input ref={input} type="search" enterkeyhint="search" autocomplete="off" aria-label="Ort oder Adresse" placeholder="Ort oder Adresse" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
        <button type="button" class="find-button find-quiet" onClick={onClose}>Abbrechen</button>
      </form>
      <div class="find-results" aria-live="polite">
        {found.status === 'loading' && <p class="find-text">Suche …</p>}
        {found.status === 'error' && <p class="find-text">Die Suche ist nicht erreichbar.</p>}
        {found.status === 'ok' && !found.places.length && <p class="find-text">Nichts gefunden.</p>}
        {found.status === 'ok' && found.places.map((p) => (
          <button type="button" key={p.id} class="find-result" onClick={() => onPick(p)}>
            <span class="find-name">{p.title}</span>
            {p.subtitle && <span class="find-text">{p.subtitle}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
