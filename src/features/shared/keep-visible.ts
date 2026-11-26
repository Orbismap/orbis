// Phones: a selected point stays in view. If the sheet lies over it, the map moves just far enough (decision 2 of
// docs/MOBILE-PLAN.md); otherwise the map is left alone.
import { effect } from '@preact/signals';
import { inspector, probe } from '../../state/selection';
import { mapEngine, sheetDetent } from '../../state/ui';
import { sheetCover } from '../../state/view';

const MARGIN = 32;

/** How far up (px) the point at height `y` has to move to leave the covered strip at the bottom; 0 if it is clear of it. */
export function hiddenBy(y: number, height: number, cover: number): number {
  const edge = height - cover;
  return y > edge - MARGIN ? Math.round(y - edge / 2) : 0;
}

/** Returns a dispose function. */
export function startKeepVisible(): () => void {
  let done = '';
  let frame = 0;
  const stop = effect(() => {
    const at = inspector.value?.card.location ?? (probe.value ? ([probe.value.lng, probe.value.lat] as [number, number]) : undefined);
    const cover = sheetCover.value;
    if (!at) return void (done = '');
    if (sheetDetent.value !== 'half') return;
    // once per point and height: afterwards the map belongs to the finger, also when a moving object drifts under the sheet
    const key = `${inspector.value?.card.title ?? at.join(',')}|${cover}`;
    if (key === done) return;
    done = key;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const ml = mapEngine.peek()?.ml;
      if (!ml || ml.isMoving()) return;
      const dy = hiddenBy(ml.project(at).y, ml.getContainer().clientHeight, cover);
      if (dy) ml.panBy([0, dy], { duration: 300 });
    });
  });
  return () => {
    stop();
    cancelAnimationFrame(frame);
  };
}
