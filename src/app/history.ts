// Back gesture / back button on phones: one page back in the sheet, then the sheet down by one detent (DESIGN.md).
// One history entry exists while there is something to go back from.
// The entry below it still holds the URL from before, and the URL carries the state (layers, camera): going back would
// apply that old state again, so the current one is written over it before `hashchange` reads it.
// That entry is marked (`orbisBase`): a link that only changes the hash fires `popstate` too and must keep its URL.
import { effect } from '@preact/signals';
import { sheetDetent } from '../state/ui';

export interface SheetNav {
  /** Whether a page lies over the list. Read inside an effect, so it has to read signals. */
  hasPage(): boolean;
  back(): void;
}

/** `currentUrl` returns the URL of the state on screen. */
export function startSheetHistory(currentUrl: () => string, pages: SheetNav): () => void {
  let pushed = false;
  let own = false; // the next popstate is our own `history.back()`
  let stepping = false;
  const sync = () => {
    const open = pages.hasPage() || sheetDetent.value !== 'peek';
    // while a back is under way, the entry to push has to wait for it
    if (own || stepping) return;
    if (open && !pushed) {
      history.replaceState({ ...history.state, orbisBase: true }, '');
      history.pushState({ orbisSheet: true }, '');
      pushed = true;
    } else if (!open && pushed) {
      pushed = false;
      if (history.state?.orbisSheet) {
        own = true;
        history.back();
      }
    }
  };
  const stop = effect(sync);
  const onPop = () => {
    if (!(own || pushed) || !history.state?.orbisBase) return;
    const asked = !own;
    own = false;
    pushed = false;
    if (asked) {
      stepping = true;
      const d = sheetDetent.peek();
      if (pages.hasPage()) pages.back();
      else if (d !== 'peek') sheetDetent.value = d === 'full' ? 'half' : 'peek';
      stepping = false;
    }
    // after the step: the URL below the sheet shows what is on screen now
    history.replaceState(history.state, '', currentUrl());
    sync();
  };
  addEventListener('popstate', onPop);
  return () => {
    stop();
    removeEventListener('popstate', onPop);
  };
}
