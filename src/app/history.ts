// Back gesture / back button lowers the sheet by one detent (DESIGN.md). One history entry exists while the sheet is open.
import { effect } from '@preact/signals';
import { sheetDetent } from '../state/ui';

export function startSheetHistory(): () => void {
  let pushed = false;
  const stop = effect(() => {
    const d = sheetDetent.value;
    if (d !== 'peek' && !pushed) {
      history.pushState({ orbisSheet: true }, '');
      pushed = true;
    } else if (d === 'peek' && pushed) {
      pushed = false;
      if (history.state?.orbisSheet) history.back();
    }
  });
  const onPop = () => {
    if (!pushed) return;
    pushed = false;
    const d = sheetDetent.peek();
    if (d === 'full') sheetDetent.value = 'half';
    else if (d === 'half') sheetDetent.value = 'peek';
    // lowering to half keeps the sheet open: leave a new entry for the next back press
    if (sheetDetent.peek() !== 'peek') {
      history.pushState({ orbisSheet: true }, '');
      pushed = true;
    }
  };
  addEventListener('popstate', onPop);
  return () => {
    stop();
    removeEventListener('popstate', onPop);
  };
}
