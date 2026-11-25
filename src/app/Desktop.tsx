import { useEffect, useRef } from 'preact/hooks';
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

/** Höhe der Zeitleiste als --dock-h: Legende und Jahreszeitenleiste sitzen darüber, die Zeitleiste ist je nach Datensätzen unterschiedlich hoch. */
function useDockHeight() {
  const hud = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dock.current;
    const root = hud.current;
    if (!el || !root) return;
    const set = () => root.style.setProperty('--dock-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { hud, dock };
}

export function DesktopLayout() {
  const { hud, dock } = useDockHeight();
  return (
    <div ref={hud} class="hud hud-desktop" style={{ '--map-left': `${hudMapLeft.value}px` }}>
      <LeftHud />
      <CatalogModal />
      <SettingsModal />
      <div class="topbar-pos">
        <TopBar />
      </div>
      <div class="rail-pos">
        <ToolRail />
      </div>
      <div ref={dock} class="dock">
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
