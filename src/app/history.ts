// Back gesture / back button lowers the sheet by one detent (DESIGN.md). One history entry exists while the sheet is open.
// The entry below it still holds the URL from before the sheet was opened, and the URL carries the state (layers, camera):
// going back would apply that old state again, so the current one is written over it before `hashchange` reads it.
// That entry is marked (`orbisBase`): a link that only changes the hash fires `popstate` too and must keep its URL.
import { effect } from '@preact/signals';
import { sheetDetent } from '../state/ui';

/** `currentUrl` returns the URL of the state on screen. */
export function startSheetHistory(currentUrl: () => string): () => void {
  let pushed = false;
  let own = false; // the next popstate is our own `history.back()`
  const stop = effect(() => {
    const d = sheetDetent.value;
    if (d !== 'peek' && !pushed) {
      history.replaceState({ ...history.state, orbisBase: true }, '');
      history.pushState({ orbisSheet: true }, '');
      pushed = true;
    } else if (d === 'peek' && pushed) {
      pushed = false;
      if (history.state?.orbisSheet) {
        own = true;
        history.back();
      }
    }
  });
  const onPop = () => {
    if (!(own || pushed) || !history.state?.orbisBase) return;
    history.replaceState(history.state, '', currentUrl());
    own = false;
    if (!pushed) return;
    pushed = false;
    const d = sheetDetent.peek();
    // lowering to half keeps the sheet open: the effect above leaves a new entry for the next back press
    if (d === 'full') sheetDetent.value = 'half';
    else if (d === 'half') sheetDetent.value = 'peek';
  };
  addEventListener('popstate', onPop);
  return () => {
    stop();
    removeEventListener('popstate', onPop);
  };
}
