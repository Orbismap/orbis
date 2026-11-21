import { effect } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { loadRegional, regionalReady, type Bounds } from '../../map/basemaps/regional';
import { activeKarte } from '../../state/session';
import { camera, viewport } from '../../state/view';
import { MAX_VIEW_SPAN, regionalFor, type RegionalOption } from './regional-list';

interface Snap { view?: Bounds; center: [number, number] }
const snapNow = (): Snap => ({ view: viewport.peek()?.bounds, center: [camera.peek().lng, camera.peek().lat] });

export interface RegionalState {
  list: RegionalOption[];
  ready: boolean;
  failed: boolean;
  wide: boolean;
  /** the list stands still while the pointer is over it or focus is in it, the newest view is applied afterwards */
  hold(): void;
  release(): void;
}

/**
 * Regional basemaps touching the current view, nearest to the map centre first. Follows the view with a delay and
 * stands still while the pointer or focus is on it, so the entry under the pointer never jumps. Loads the lazy data.
 */
export function useRegional(): RegionalState {
  const k = activeKarte.value;
  const [failed, setFailed] = useState(false);
  const [snap, setSnap] = useState<Snap>(snapNow);
  const holds = useRef(0);
  const pending = useRef<Snap | null>(null);
  useEffect(() => {
    loadRegional().catch(() => setFailed(true));
    let t = 0;
    const stop = effect(() => {
      const next: Snap = { view: viewport.value?.bounds, center: [camera.value.lng, camera.value.lat] };
      clearTimeout(t);
      t = window.setTimeout(() => (holds.current > 0 ? (pending.current = next) : setSnap(next)), 400);
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
    hold: () => void holds.current++,
    release: () => {
      holds.current = Math.max(0, holds.current - 1);
      if (holds.current === 0 && pending.current) (setSnap(pending.current), (pending.current = null));
    },
  };
}

