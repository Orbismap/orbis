import { useEffect } from 'preact/hooks';
import { Icon, type IconName } from '../ui/icons';
import { Start } from '../screens/Start';
import { Board } from '../screens/Board';
import { MapTab } from '../screens/MapTab';
import { Saved } from '../screens/Saved';
import { SearchScreen } from '../screens/search';
import { JourneysScreen } from '../screens/Journeys';
import { JourneyDetail } from '../screens/JourneyDetail';
import { goTab, stack, tab, type TabId } from '../state/nav';
import { initLocation } from '../state/location';
import './app.css';

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'start', label: 'Start', icon: 'home' },
  { id: 'abfahrten', label: 'Abfahrten', icon: 'clock' },
  { id: 'karte', label: 'Karte', icon: 'map' },
  { id: 'merkliste', label: 'Merkliste', icon: 'star' },
];

export function App() {
  useEffect(() => { void initLocation(); }, []);
  const top = stack.value[stack.value.length - 1];

  return (
    <div class="bn-app">
      <main class="bn-main">
        {tab.value === 'start' && <Start />}
        {tab.value === 'abfahrten' && <Board />}
        {tab.value === 'karte' && <MapTab />}
        {tab.value === 'merkliste' && <Saved />}
        {top?.kind === 'search' && <SearchScreen key={stack.value.length} target={top.target} />}
        {top?.kind === 'journeys' && <JourneysScreen key={stack.value.length} />}
        {top?.kind === 'journey' && <JourneyDetail key={stack.value.length} journey={top.journey} />}
      </main>
      <nav class="bn-tabs" aria-label="Hauptnavigation">
        {TABS.map((t) => (
          <button key={t.id} type="button" class="bn-tab" aria-current={t.id === tab.value && !top ? 'page' : undefined} onClick={() => goTab(t.id)}>
            <Icon name={t.icon} size={22} />{t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
