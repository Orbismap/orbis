import { Attribution } from '../features/attribution/Attribution';
import { Legend } from '../features/legend/Legend';
import { startedWithMap as startedFromWetter } from '../map/adopt';
import { ReturnFromWetter } from './ReturnFromWetter';
import { SeasonBar } from '../features/season/SeasonBar';
import { Scalebar } from '../features/scalebar/Scalebar';
import { Timeline } from '../features/timeline/Timeline';
import { TopBar, ToolRail } from '../features/tools/Tools';
import { hudMapLeft } from '../state/hud';
import { CatalogModal, LeftHud, SettingsModal } from './Hud';

export function DesktopLayout() {
  return (
    <div class="hud hud-desktop" style={{ '--map-left': `${hudMapLeft.value}px` }}>
      <LeftHud />
      <CatalogModal />
      <SettingsModal />
      <div class="topbar-pos">
        <TopBar />
      </div>
      <div class="rail-pos">
        <ToolRail />
      </div>
      <div class="dock">
        <Timeline />
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
    </div>
  );
}
