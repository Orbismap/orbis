import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { online } from '@/core/online';
import { OrbisSwitcher } from '@/ui/hud/OrbisHud';
import { Icon } from '../ui/icons';
import { ActiveScreen, DESKTOP, isDesktop, menuOpen, panelOpen } from '../ui/scene';
import { Sheet } from '../ui/Sheet';
import { TransitMap, showMyLocation } from '../ui/TransitMap';
import { detent, sheetCover } from '../ui/sheetState';
import { Start } from '../screens/Start';
import { Stops } from '../screens/Stops';
import { Saved } from '../screens/Saved';
import { SearchScreen } from '../screens/search';
import { JourneysScreen } from '../screens/Journeys';
import { JourneyDetail } from '../screens/JourneyDetail';
import { StopScreen } from '../screens/StopScreen';
import { TripScreen } from '../screens/TripScreen';
import { goTab, stack, tab, type Entry, type TabId } from '../state/nav';
import { initLocation, locationState } from '../state/location';
import { Menu } from './Menu';
import { TABS } from './tabs';
import './app.css';

const PAGES: Record<TabId, () => ComponentChildren> = {
  start: () => <Start />,
  abfahrten: () => <Stops />,
  merkliste: () => <Saved />,
};

function page(p: Entry) {
  switch (p.kind) {
    case 'search': return <SearchScreen target={p.target} />;
    case 'journeys': return <JourneysScreen />;
    case 'journey': return <JourneyDetail journey={p.journey} />;
    case 'stop': return <StopScreen stop={p.stop} />;
    case 'trip': return <TripScreen {...p} />;
  }
}

export function App() {
  useEffect(() => { void initLocation(); }, []);
  const pages = stack.value;
  const desktop = isDesktop.value;
  const current = tab.value;

  return (
    <div class="bn-app" data-menu={menuOpen.value ? 'open' : 'closed'} data-panel={panelOpen.value ? 'open' : 'closed'} style={{ '--menu-w': `${DESKTOP.menu}px`, '--panel-w': `${DESKTOP.panel}px` }}>
      <main class="bn-main">
        <TransitMap />
        {desktop ? <Menu /> : <OrbisSwitcher project="bahn" />}
        <LocateButton />
        <Sheet>
          {/* alle offenen Seiten bleiben bestehen, nur die oberste ist sichtbar und steuert die Karte */}
          <ActiveScreen.Provider key={current} value={pages.length === 0}>{PAGES[current]()}</ActiveScreen.Provider>
          {pages.map((p, i) => <ActiveScreen.Provider key={p.key} value={i === pages.length - 1}>{page(p)}</ActiveScreen.Provider>)}
        </Sheet>
        {!online.value && <div class="bn-offline" role="status">Offline · gespeicherte Daten</div>}
      </main>
      {!desktop && (
        <nav class="bn-tabs" aria-label="Hauptnavigation">
          {TABS.map((t) => (
            <button key={t.id} type="button" class="bn-tab" aria-current={t.id === current ? 'page' : undefined} onClick={() => goTab(t.id)}>
              <span class="bn-tab-ic"><Icon name={t.icon} size={22} /></span>{t.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

/** Knopf „Mein Standort“, schwebt über dem Blatt. */
function LocateButton() {
  const desktop = isDesktop.value;
  if (!desktop && detent.value === 'full') return null;
  const busy = locationState.value === 'asking';
  return (
    <button
      type="button" class={`bn-fab ${busy ? 'bn-busy' : ''}`} style={{ bottom: (desktop ? 0 : sheetCover.value) + 16 }}
      aria-label="Meinen Standort zeigen" title="Mein Standort" onClick={() => void showMyLocation()}
    >
      <Icon name="locate" size={24} />
    </button>
  );
}
