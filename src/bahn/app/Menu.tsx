// Am Desktop: das linke Menü der Orbis-Apps mit Suche, den drei Bereichen und gemerkten wie letzten Zielen.
import { HudMenu, HudRow, OrbisHud, useMenuShortcut } from '@/ui/hud/OrbisHud';
import { Icon } from '../ui/icons';
import { DESKTOP, menuOpen, panelOpen } from '../ui/scene';
import { openSaved, savedLabel } from '../screens/Start';
import { favorites, recents, savedKey, type Saved } from '../state/places';
import { goTab, push, stack, tab } from '../state/nav';
import { TABS } from './tabs';

const SHOWN = 6;

function openSearch() {
  panelOpen.value = true;
  if (stack.peek().at(-1)?.kind !== 'search') push({ kind: 'search', target: 'to' });
}

export function Menu() {
  useMenuShortcut(() => (menuOpen.value = !menuOpen.value));
  const saved = favorites.list.value.slice(0, SHOWN);
  const recent = recents.list.value.filter((r) => !favorites.has(r)).slice(0, SHOWN);
  const rows = (title: string, list: Saved[]) => list.length > 0 && (
    <>
      <h2>{title}</h2>
      {list.map((s) => <HudRow key={savedKey(s)} page icon={<Icon name={s.kind === 'stop' ? 'pin' : 'swap'} size={18} />} title={savedLabel(s)} onClick={() => openSaved(s)} />)}
    </>
  );

  return (
    <OrbisHud project="bahn" open={menuOpen.value} onOpenChange={(open) => (menuOpen.value = open)} style={{ '--hud-main-w': `${DESKTOP.menu}px` }}>
      <HudMenu label="Bus & Bahn" dense>
        <button type="button" class="ohud-search" onClick={openSearch}>
          <Icon name="search" size={15} />Wohin möchtest du?
        </button>
        <h2>Fahren</h2>
        {TABS.map((t) => <HudRow key={t.id} page current={panelOpen.value && t.id === tab.value} icon={<Icon name={t.icon} size={18} />} title={t.label} onClick={() => goTab(t.id)} />)}
        {rows('Gemerkt', saved)}
        {rows('Zuletzt', recent)}
      </HudMenu>
    </OrbisHud>
  );
}
