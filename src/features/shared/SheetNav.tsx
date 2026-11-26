// "Zurück" and "Schließen" of a page in the phone sheet. Nothing of this shows on the desktop.
import { dismissAll, goBack, sheetPages } from '../../state/sheet-pages';
import { isMobile } from '../../state/ui';
import { IconButton } from '../../ui/Button';

/** One page back. `always`: for pages reached from the list, where it is the only way out; cards close instead. */
export function SheetBack({ always }: { always?: boolean }) {
  if (!isMobile.value || (!always && sheetPages.value.length < 2)) return null;
  return <IconButton icon="chevron-left" label="Zurück" class="sheet-back" onClick={goBack} />;
}

/** Out of all pages at once; only needed where more than one lies over the list. */
export function SheetClose() {
  if (!isMobile.value || sheetPages.value.length < 2) return null;
  return <IconButton icon="close" label="Schließen" class="sheet-close" onClick={dismissAll} />;
}
