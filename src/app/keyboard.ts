import { clearSelection, inspector, probe } from '../state/selection';
import { karten } from '../karten/store';
import { setActiveKarte } from '../state/session';
import { goLive, step } from '../state/time';
import { isMobile, leftPanelOpen, leftView, searchOpen, settingsOpen, shortcutsOpen, sheetDetent } from '../state/ui';
import { projection, setProjection } from '../state/view';
import { togglePlay } from '../features/timeline/Transport';

const INTERACTIVE = 'input, textarea, select, [contenteditable="true"]';
const OWN_ARROWS = '[role="slider"], [role="tab"], [role="radio"], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="combobox"]';
const OWN_SPACE = 'button, a, summary, [role="slider"], [role="tab"], [role="radio"], [role="switch"], [role="option"], [role="menuitem"], [role="menuitemradio"]';

/** Global shortcuts (DESIGN.md "Tastatur"). Returns a dispose function. */
export function startKeyboard(): () => void {
  const on = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const t = e.target as HTMLElement | null;
    const typing = !!t?.closest(INTERACTIVE);
    const mod = e.metaKey || e.ctrlKey;

    if (mod && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchOpen.value = !searchOpen.value;
      return;
    }
    if (e.key === 'Escape') {
      if (inspector.peek() || probe.peek()) {
        clearSelection();
        if (isMobile.peek()) sheetDetent.value = 'peek';
      } else if (leftView.peek() !== 'layers') leftView.value = 'layers';
      else if (isMobile.peek() && sheetDetent.peek() !== 'peek') sheetDetent.value = sheetDetent.peek() === 'full' ? 'half' : 'peek';
      else return;
      e.preventDefault();
      return;
    }
    if (typing || mod || e.altKey || searchOpen.peek() || shortcutsOpen.peek()) return;

    switch (e.key) {
      case '/':
        e.preventDefault();
        searchOpen.value = true;
        break;
      case '?':
        e.preventDefault();
        shortcutsOpen.value = true;
        break;
      case '[':
        if (isMobile.peek()) sheetDetent.value = sheetDetent.peek() === 'peek' ? 'half' : 'peek';
        else leftPanelOpen.value = !leftPanelOpen.peek();
        break;
      case 'g':
      case 'G':
        setProjection(projection.peek() === 'globe' ? 'mercator' : 'globe');
        break;
      case ' ':
        if (t?.closest(OWN_SPACE)) return;
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        if (t?.closest(OWN_ARROWS)) return;
        e.preventDefault();
        step(e.key === 'ArrowLeft' ? -1 : 1);
        break;
      case 'j':
      case 'J':
        goLive();
        break;
      case ',':
        leftPanelOpen.value = true;
        leftView.value = 'settings';
        settingsOpen.value = true;
        break;
      default:
        if (/^[1-9]$/.test(e.key)) {
          const k = karten.peek()[Number(e.key) - 1];
          if (k) setActiveKarte(k.id);
        }
    }
  };
  document.addEventListener('keydown', on);
  return () => document.removeEventListener('keydown', on);
}
