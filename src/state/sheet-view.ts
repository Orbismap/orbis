import { batch } from '@preact/signals';
import { bringToFront, dismissAll } from './sheet-pages';
import { isMobile, leftView, searchOpen, type LeftView } from './ui';

/** Opens a view of the left panel; on phones it comes to the front of the sheet. */
export function showView(view: LeftView): void {
  const phone = isMobile.peek();
  batch(() => {
    if (phone) {
      searchOpen.value = false;
      if (view === 'layers') dismissAll();
    }
    leftView.value = view;
  });
  if (phone && view !== 'layers') bringToFront(view);
}
