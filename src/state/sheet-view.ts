import { batch } from '@preact/signals';
import { orteView } from './hud';
import { clearSelection } from './selection';
import { isMobile, leftView, sheetDetent, type LeftView } from './ui';

/** Opens a view of the left panel; on phones also brings it to the front when the sheet is lowered or shows a selection. */
export function showView(view: LeftView): void {
  batch(() => {
    leftView.value = view;
    if (!isMobile.peek()) return;
    orteView.value = null; // the planner would stay in front of the view
    clearSelection();
    sheetDetent.value = 'full';
  });
}
