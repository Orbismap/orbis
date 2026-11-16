import { effect } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { setBasemap } from '../../karten/store';
import { isWorldwide, loadRegional, regionalReady, type Bounds } from '../../map/basemaps/regional';
import { activeKarte } from '../../state/session';
import { camera, viewport } from '../../state/view';
import { Select } from '../../ui/Select';
import { MAX_VIEW_SPAN, regionalFor, type RegionalOption } from './regional-list';

interface Snap { view?: Bounds; center: [number, number] }
const snapNow = (): Snap => ({ view: viewport.peek()?.bounds, center: [camera.peek().lng, camera.peek().lat] });

export interface RegionalState {
  list: RegionalOption[];
  ready: boolean;
  failed: boolean;
  wide: boolean;
  /** the list stands still while the dropdown has focus, the newest view is applied afterwards */
  onFocusIn(): void;
  onFocusOut(): void;
}

/**
 * Regional basemaps touching the current view, nearest to the map centre first. Follows the view with a delay and
 * stands still while the dropdown has focus, so the entry under the pointer never jumps. Loads the lazy data.
 */
export function useRegional(): RegionalState {
  const k = activeKarte.value;
  const [failed, setFailed] = useState(false);
  const [snap, setSnap] = useState<Snap>(snapNow);
  const focused = useRef(false);
  const pending = useRef<Snap | null>(null);
  useEffect(() => {
    loadRegional().catch(() => setFailed(true));
    let t = 0;
    const stop = effect(() => {
      const next: Snap = { view: viewport.value?.bounds, center: [camera.value.lng, camera.value.lat] };
      clearTimeout(t);
      t = window.setTimeout(() => (focused.current ? (pending.current = next) : setSnap(next)), 400);
    });
    return () => (stop(), clearTimeout(t));
  }, []);
  const ready = regionalReady.value;
  const list = useMemo(() => regionalFor(snap.view, snap.center, k.basemap), [ready, snap, k.basemap]);
  return {
    list,
    ready,
    failed,
    wide: !snap.view || snap.view[2] - snap.view[0] > MAX_VIEW_SPAN,
    onFocusIn: () => (focused.current = true),
    onFocusOut: () => {
      focused.current = false;
      if (pending.current) (setSnap(pending.current), (pending.current = null));
    },
  };
}

/** Dropdown "Regionale Karten" below the grid: only basemaps whose coverage touches the current view (plus the selected one). */
export function RegionalSelect({ r }: { r: RegionalState }) {
  const k = activeKarte.value;
  const options = r.list.map(({ item }) => ({
    value: item.id as string,
    label: item.country && !isWorldwide(item.bounds) ? `${item.label} · ${item.country}` : item.label,
  }));
  const current = options.some((o) => o.value === k.basemap) ? k.basemap : '';
  const hint = r.failed ? 'Regionale Karten konnten nicht geladen werden.' : !r.ready ? 'Lade regionale Karten …' : r.wide ? 'Näher heranzoomen, um regionale Karten zu sehen.' : options.length === 0 ? 'Für diesen Ausschnitt gibt es keine regionalen Karten.' : '';
  return (
    <div class="bm-regional">
      <h4 class="bm-gtitle" id="bm-regional-title">Regionale Karten</h4>
      {options.length > 0 && (
        <div onFocusIn={r.onFocusIn} onFocusOut={r.onFocusOut}>
          <Select
            aria-labelledby="bm-regional-title"
            value={current}
            options={[{ value: '', label: 'Regionale Karte wählen …' }, ...options]}
            onChange={(v) => v && setBasemap(k.id, v as typeof k.basemap)}
          />
        </div>
      )}
      {hint && <p class="bm-hint">{hint}</p>}
    </div>
  );
}
