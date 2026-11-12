import { effect } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { WarningDialog } from '../features/boost/WarningDialog';
import { Search } from '../features/search/Search';
import { Shortcuts } from '../features/shortcuts/Shortcuts';
import { Toasts } from '../features/toasts/Toasts';
import { breakpoint, isMobile, searchOpen, shortcutsOpen } from '../state/ui';
import { settings } from '../state/settings';
import { TooltipLayer } from '../ui/Tooltip';
import { DesktopLayout } from './Desktop';
import { startKeyboard } from './keyboard';
import { startPadding } from './layout';
import { MapView } from './MapView';
import { MobileLayout } from './Mobile';
import './app.css';

// set before the first paint so CSS keyed on data-bp is right from the start
if (typeof document !== 'undefined') document.documentElement.dataset.bp = breakpoint.peek();

/** Hooks <html> attributes to state: breakpoint (for CSS), theme-color for the browser chrome. */
function useDocumentState() {
  useEffect(() => {
    const stops = [
      effect(() => void (document.documentElement.dataset.bp = breakpoint.value)),
      effect(() => {
        settings.value.theme;
        const apply = () => {
          const c = getComputedStyle(document.documentElement).getPropertyValue('--ink-0').trim();
          document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c || '#0A0F18');
        };
        requestAnimationFrame(apply);
      }),
      startPadding(),
      startKeyboard(),
    ];
    return () => stops.forEach((s) => s());
  }, []);
}

export function App() {
  useDocumentState();
  return (
    <div class="app">
      <MapView />
      {isMobile.value ? <MobileLayout /> : <DesktopLayout />}
      {searchOpen.value && <Search />}
      {shortcutsOpen.value && <Shortcuts />}
      <WarningDialog />
      <Toasts />
      <TooltipLayer />
    </div>
  );
}
