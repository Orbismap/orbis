import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { online } from '@/core/online';
import { Icon, type IconName } from '../ui/icons';
import { ActiveScreen, isDesktop } from '../ui/scene';
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
import './app.css';

const TABS: { id: TabId; label: string; icon: IconName; page: () => ComponentChildren }[] = [
  { id: 'start', label: 'Start', icon: 'home', page: () => <Start /> },
  { id: 'abfahrten', label: 'Abfahrten', icon: 'clock', page: () => <Stops /> },
  { id: 'merkliste', label: 'Merkliste', icon: 'star', page: () => <Saved /> },
];

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
  const current = TABS.find((t) => t.id === tab.value)!;

  return (
    <div class="bn-app">
      <main class="bn-main">
        <TransitMap />
        <LocateButton />
        <Sheet>
          {/* alle offenen Seiten bleiben bestehen, nur die oberste ist sichtbar und steuert die Karte */}
          <ActiveScreen.Provider key={current.id} value={pages.length === 0}>{current.page()}</ActiveScreen.Provider>
          {pages.map((p, i) => <ActiveScreen.Provider key={p.key} value={i === pages.length - 1}>{page(p)}</ActiveScreen.Provider>)}
        </Sheet>
        {!online.value && <div class="bn-offline" role="status">Offline · gespeicherte Daten</div>}
      </main>
      <nav class="bn-tabs" aria-label="Hauptnavigation">
        <img class="bn-rail-logo" src="./bahn/favicon.svg" alt="Bus &amp; Bahn" width="40" height="40" />
        {TABS.map((t) => (
          <button key={t.id} type="button" class="bn-tab" aria-current={t.id === tab.value ? 'page' : undefined} onClick={() => goTab(t.id)}>
            <span class="bn-tab-ic"><Icon name={t.icon} size={22} /></span>{t.label}
          </button>
        ))}
      </nav>
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
