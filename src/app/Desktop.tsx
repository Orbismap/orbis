import { Attribution } from '../features/attribution/Attribution';
import { InspectorCard } from '../features/inspector/Inspector';
import { KartenBar } from '../features/karten-bar/KartenBar';
import { Legend } from '../features/legend/Legend';
import { ProbeCard } from '../features/probe/ProbeCard';
import { Scalebar } from '../features/scalebar/Scalebar';
import { Timeline } from '../features/timeline/Timeline';
import { TopBar, ToolRail } from '../features/tools/Tools';
import { inspector, probe } from '../state/selection';
import { leftPanelOpen, leftTab, leftView, searchOpen } from '../state/ui';
import { IconButton } from '../ui/Button';
import { Kbd } from '../ui/Chip';
import { Icon } from '../ui/icons/Icon';
import { Panel } from '../ui/Panel';
import { ScrollArea } from '../ui/ScrollArea';
import { LeftBody } from './LeftBody';
import { OrbisMark } from '../ui/brand/OrbisMark';

function LeftPanel() {
  const open = leftPanelOpen.value;
  const view = leftView.value;
  const fill = view !== 'layers' || leftTab.value === 'feed';
  return (
    <aside class="left" data-open={open} data-fill={fill} aria-label="Karten und Ebenen" {...(open ? {} : ({ inert: '' } as object))}>
      <Panel as="div" class="left-panel">
        <div class="lhead">
          <OrbisMark size={34} variant="small" />
          <span class="lname">Orbis</span>
          <IconButton icon="panel-left" label="Seitenleiste einklappen" shortcut="[" onClick={() => (leftPanelOpen.value = false)} />
        </div>
        <div class="lsearch-wrap">
          <button type="button" class="lsearch" onClick={() => (searchOpen.value = true)} aria-label="Suche öffnen" aria-keyshortcuts="Meta+K Control+K">
            <Icon name="search" size={16} />
            <span>Suchen</span>
            <Kbd keys="mod+K" />
          </button>
        </div>
        {view === 'layers' && <KartenBar />}
        <div class="lcontent">
          <LeftBody />
        </div>
      </Panel>
    </aside>
  );
}

function RightPanel() {
  const sel = inspector.value;
  const p = probe.value;
  if (!sel && !p) return null;
  return (
    <aside class="right" aria-label="Auswahl">
      <Panel as="div" class="right-panel">
        <ScrollArea class="right-scroll">
          {sel ? <InspectorCard key={`${sel.layerId}:${sel.card.title}:${sel.card.time ?? ''}`} card={sel.card} layerId={sel.layerId} /> : <ProbeCard />}
        </ScrollArea>
      </Panel>
    </aside>
  );
}

export function DesktopLayout() {
  return (
    <div class="hud hud-desktop" style={{ '--map-left': leftPanelOpen.value ? 'calc(var(--edge) + var(--panel-left) + var(--s-2))' : '0px' }}>
      <LeftPanel />
      {!leftPanelOpen.value && (
        <div class="reopen">
          <IconButton icon="panel-left" label="Seitenleiste öffnen" shortcut="[" variant="solid" class="cap" onClick={() => (leftPanelOpen.value = true)} />
        </div>
      )}
      <div class="topbar-pos">
        <TopBar />
      </div>
      <div class="rail-pos">
        <ToolRail />
      </div>
      <RightPanel />
      <div class="dock">
        <Timeline />
      </div>
      <div class="maplegend-pos">
        <Legend />
      </div>
      <div class="scalebar-pos">
        <Scalebar />
      </div>
      <div class="attr-pos">
        <Attribution />
      </div>
    </div>
  );
}
