import { useEffect } from 'preact/hooks';
import { SeasonBar } from '../features/season/SeasonBar';
import { Scalebar } from '../features/scalebar/Scalebar';
import { Attribution } from '../features/attribution/Attribution';
import { InspectorCard } from '../features/inspector/Inspector';
import { KartenChangeRow } from '../features/karten-bar/actions';
import { KartenSwitcher } from '../features/karten-bar/KartenSwitcher';
import { Legend } from '../features/legend/Legend';
import { startedWithMap as startedFromWetter } from '../map/adopt';
import { ReturnFromWetter } from './ReturnFromWetter';
import { ProbeCard } from '../features/probe/ProbeCard';
import { Readout } from '../features/timeline/Transport';
import { TimelineCompact } from '../features/timeline/Timeline';
import { TopBar, ToolRail } from '../features/tools/Tools';
import { reducedMotion } from '../state/settings';
import { inspector, probe } from '../state/selection';
import { searchOpen, sheetDetent, leftView } from '../state/ui';
import { hasTimeLayers } from '../state/time';
import { Icon } from '../ui/icons/Icon';
import { Sheet } from '../ui/Sheet';
import { LeftBody } from './LeftBody';
import { startSheetHistory } from './history';

function Header() {
  return (
    <header class="mhead">
      <button type="button" class="msearch" onClick={() => (searchOpen.value = true)} aria-label="Suche öffnen">
        <Icon name="search" size={18} />
        <span>Ort oder Ebene suchen</span>
      </button>
      <TopBar />
    </header>
  );
}

function PeekRow() {
  return (
    <div class="peek">
      <div class="peek-row">
        <KartenSwitcher />
        <div class="peek-mid">{hasTimeLayers.value ? <Readout /> : null}</div>
      </div>
      <TimelineCompact />
    </div>
  );
}

export function MobileLayout() {
  const sel = inspector.value;
  const p = probe.value;
  const detent = sheetDetent.value;

  // selection opens the sheet at half; catalog and settings need room
  useEffect(() => {
    if ((sel || p) && sheetDetent.peek() === 'peek') sheetDetent.value = 'half';
  }, [sel, p]);
  const view = leftView.value;
  useEffect(() => {
    if (view !== 'layers') sheetDetent.value = 'full';
  }, [view]);
  useEffect(() => startSheetHistory(), []);

  return (
    <div class="hud hud-mobile" data-detent={detent}>
      <Header />
      <div class="rail-pos">
        <ToolRail popoverUp />
      </div>
      <div class="season-pos">
        <SeasonBar />
      </div>
      <div class="maplegend-pos">
        <Legend />
      </div>
      <div class="scalebar-pos">
        <Scalebar />
        {startedFromWetter && <ReturnFromWetter />}
      </div>
      <div class="attr-pos">
        <Attribution />
      </div>
      <Sheet
        label="Karten, Ebenen und Zeit"
        detent={detent}
        onDetent={(d) => (sheetDetent.value = d)}
        peekHeight={128}
        topInset={64}
        reducedMotion={reducedMotion()}
        peek={<PeekRow />}
      >
        {sel ? <InspectorCard key={`${sel.layerId}:${sel.card.title}`} card={sel.card} layerId={sel.layerId} /> : p ? <ProbeCard /> : (
          <>
            {view === 'layers' && <KartenChangeRow />}
            <LeftBody />
          </>
        )}
      </Sheet>
    </div>
  );
}
