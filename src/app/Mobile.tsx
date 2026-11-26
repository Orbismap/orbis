import { useEffect, useRef } from 'preact/hooks';
import { serializeHash } from '../core/url';
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
import { activeKarte } from '../state/session';
import { clearSelection, inspector, probe } from '../state/selection';
import { showView } from '../state/sheet-view';
import { currentUrlState } from '../state/url-sync';
import { searchOpen, sheetDetent, leftTab, leftView } from '../state/ui';
import { hasTimeLayers } from '../state/time';
import { detailPage } from '../features/layers-panel/themes-state';
import { feedEntries } from '../features/feed/Feed';
import { Icon } from '../ui/icons/Icon';
import { Sheet } from '../ui/Sheet';
import { LeftBody } from './LeftBody';
import { startSheetHistory } from './history';
import './mobile.css';

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

/** Always visible bar of the sheet: the Karte, the time or what is on the map, and "add layer"; the timeline below, if any. */
function PeekRow({ timed }: { timed: boolean }) {
  const n = activeKarte.value.layers.filter((l) => l.visible).length;
  return (
    <div class="peek">
      <div class="peek-row">
        <KartenSwitcher />
        <div class="peek-mid">{timed ? <Readout /> : <span class="peek-count">{n === 0 ? 'Keine Ebene aktiv' : n === 1 ? '1 Ebene aktiv' : `${n} Ebenen aktiv`}</span>}</div>
        <button type="button" class="peek-add" aria-label="Ebene hinzufügen" data-nodrag onClick={() => showView('catalog')}>
          <Icon name="plus" size={22} />
        </button>
      </div>
      {timed && <TimelineCompact />}
    </div>
  );
}

export function MobileLayout() {
  const sel = inspector.value;
  const p = probe.value;
  const detent = sheetDetent.value;
  const timed = hasTimeLayers.value;
  const view = leftView.value;
  const page = detailPage.value?.layerId;

  // a selection opens a lowered sheet at half, and closing it lowers the sheet again
  const raised = useRef(false);
  useEffect(() => {
    if (sel || p) {
      if (sheetDetent.peek() === 'peek') {
        raised.current = true;
        sheetDetent.value = 'half';
      }
    } else if (raised.current) {
      raised.current = false;
      if (sheetDetent.peek() === 'half') sheetDetent.value = 'peek';
    }
  }, [sel, p]);
  // catalog and settings need room; they and a layer page take the place of a selection
  useEffect(() => {
    if (view === 'layers') return;
    raised.current = false;
    clearSelection();
    sheetDetent.value = 'full';
  }, [view]);
  useEffect(() => {
    if (!page) return;
    raised.current = false;
    clearSelection();
    if (sheetDetent.peek() === 'peek') sheetDetent.value = 'half';
  }, [page]);
  useEffect(() => startSheetHistory(() => serializeHash(currentUrlState())), []);

  const list = !sel && !p;
  const feed = list && view === 'layers' && leftTab.value === 'feed' && feedEntries.value.length > 0;
  const scrollKey = sel ? `sel:${sel.layerId}:${sel.card.title}` : p ? 'probe' : view !== 'layers' ? view : page ? `page:${page}` : leftTab.value;

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
        peekHeight={timed ? 136 : 80}
        topInset={64}
        reducedMotion={reducedMotion()}
        scrollKey={scrollKey}
        keepScroll={list && view === 'layers' && !page}
        fill={list && (view === 'catalog' || feed)}
        peek={<PeekRow timed={timed} />}
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
