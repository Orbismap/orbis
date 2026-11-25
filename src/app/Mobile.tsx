import { useEffect } from 'preact/hooks';
import { serializeHash } from '../core/url';
import { SeasonBar } from '../features/season/SeasonBar';
import { ReplayBar } from '../features/replay/ReplayBar';
import { Scalebar } from '../features/scalebar/Scalebar';
import { Attribution } from '../features/attribution/Attribution';
import { KartenSwitcher } from '../features/karten-bar/KartenSwitcher';
import { Legend } from '../features/legend/Legend';
import { startedWithMap as startedFromWetter } from '../map/adopt';
import { ReturnFromWetter } from './ReturnFromWetter';
import { Readout } from '../features/timeline/Transport';
import { TimelineCompact } from '../features/timeline/Timeline';
import { LocateButton, ToolRail } from '../features/tools/Tools';
import { SearchBar } from '../features/search/SheetSearch';
import { startKeepVisible } from '../features/shared/keep-visible';
import { replayEvent, replayLoading } from '../state/replay';
import { reducedMotion } from '../state/settings';
import { activeKarte } from '../state/session';
import { goBack, sheetPages, startSheetPages } from '../state/sheet-pages';
import { showView } from '../state/sheet-view';
import { currentUrlState } from '../state/url-sync';
import { sheetDetent, leftTab } from '../state/ui';
import { sheetCover } from '../state/view';
import { hasTimeLayers } from '../state/time';
import { feedEntries } from '../features/feed/Feed';
import { OrbisSwitcher } from '../ui/hud/OrbisHud';
import { Icon } from '../ui/icons/Icon';
import { Sheet } from '../ui/Sheet';
import { PageContent, PanelPage } from './SheetPage';
import { startSheetHistory } from './history';
import './mobile.css';

/** Heights of the bar at the top of the sheet, grip included. */
const BAR = { timed: 192, plain: 136, search: 80 };
/** What a lowered sheet shows of a page: the grip and the page's head. */
const PAGE_PEEK = 80;

/** The bar of the list: search and settings; below it the Karte, the time or what is on the map, and "add layer". */
function Bar({ searching, timed }: { searching: boolean; timed: boolean }) {
  const n = activeKarte.value.layers.filter((l) => l.visible).length;
  return (
    <div class="peek">
      {/* first in both states: the field keeps its element, and with it the focus and the keyboard */}
      <SearchBar />
      {!searching && (
        <>
          <div class="peek-row">
            <KartenSwitcher />
            <div class="peek-mid">{timed ? <Readout /> : <span class="peek-count">{n === 0 ? 'Keine Ebene aktiv' : n === 1 ? '1 Ebene aktiv' : `${n} Ebenen aktiv`}</span>}</div>
            <button type="button" class="peek-add" aria-label="Ebene hinzufügen" data-nodrag onClick={() => showView('catalog')}>
              <Icon name="plus" size={22} />
            </button>
          </div>
          {timed && <TimelineCompact />}
        </>
      )}
    </div>
  );
}

export function MobileLayout() {
  const detent = sheetDetent.value;
  const timed = hasTimeLayers.value;
  const stack = sheetPages.value;
  const top = stack[stack.length - 1];
  const panel = top?.id === 'panel';
  // a panel lies over its page, which stays: the button that opened the panel lives there
  const page = panel ? stack[stack.length - 2] : top;

  useEffect(() => {
    const stops = [
      startSheetPages(),
      startSheetHistory(() => serializeHash(currentUrlState()), { hasPage: () => sheetPages.value.length > 0, back: goBack }),
      startKeepVisible(),
    ];
    return () => {
      stops.forEach((s) => s());
      sheetCover.value = 0;
    };
  }, []);

  // a replay needs the map: the sheet steps down, so it does not lie over the animation and its bar
  const replaying = !!replayEvent.value || replayLoading.value;
  useEffect(() => {
    if (replaying) sheetDetent.value = 'peek';
  }, [replaying]);

  const searching = top?.id === 'search';
  const feed = !page && leftTab.value === 'feed' && feedEntries.value.length > 0;
  const bar = !top || searching;

  return (
    <div class="hud hud-mobile" data-detent={detent} data-behind-modal>
      <OrbisSwitcher project="map" />
      <ReplayBar mobile />
      <div class="rail-pos">
        <ToolRail popoverUp locate={false} />
      </div>
      <div class="locate-pos">
        <LocateButton />
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
        label="Suche, Karten, Ebenen und Zeit"
        detent={detent}
        onDetent={(d) => (sheetDetent.value = d)}
        onRest={(px) => (sheetCover.value = px)}
        peekHeight={searching ? BAR.search : top ? PAGE_PEEK : timed ? BAR.timed : BAR.plain}
        peekLive={!bar}
        topInset={12}
        reducedMotion={reducedMotion()}
        scrollKey={top ? `${top.id}:${top.key}` : leftTab.value}
        keepScroll={!top}
        fill={!panel && (page?.id === 'catalog' || feed)}
        peek={bar ? <Bar searching={searching} timed={timed} /> : undefined}
      >
        <div class="sheet-page" hidden={panel}>
          <PageContent page={page} />
        </div>
        {/* under another page (a point tapped while it was open) the panel waits */}
        {panel && <PanelPage />}
      </Sheet>
    </div>
  );
}
