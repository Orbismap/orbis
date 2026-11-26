// The left menu of the Orbis apps with what this one offers: what to look for and where to start from.
import { HudMenu, HudPill, HudRow, OrbisHud, useMenuShortcut } from '@/ui/hud/OrbisHud';
import { Icon } from '@/ui/icons/Icon';
import { kind } from '../state/finder';
import { canEdit, signOut, token } from '../state/osm';
import { manual, position } from '../state/sensors';
import { KindSign } from './KindSign';
import { browsing, menuOpen, openAdding, openCatalogue, openSearch, useMyPosition } from '../state/ui';

export function Menu() {
  useMenuShortcut(() => (menuOpen.value = !menuOpen.value));

  const looked = kind.value;
  return (
    <OrbisHud
      project="find" fixed open={menuOpen.value} onOpenChange={(open) => (menuOpen.value = open)}
      beside={<HudPill icon={<KindSign kind={looked} size={19} />} label={looked.name} title={`Gesucht: ${looked.name} – ändern`} expanded={browsing.value} onClick={openCatalogue} />}
    >
      <HudMenu label="Orbis Find">
        <h2>Finden</h2>
        <HudRow icon={<KindSign kind={looked} size={18} />} title={looked.name} current onClick={openCatalogue} />
        <h2>Start</h2>
        <HudRow icon={<Icon name="locate" size={18} />} title="Mein Standort" current={manual.value === null} onClick={useMyPosition} />
        <HudRow icon={<Icon name="search" size={18} />} title="Ort suchen" note={manual.value ?? undefined} current={manual.value !== null} onClick={openSearch} />
        {canEdit && looked.add && (
          <>
            <h2>OpenStreetMap</h2>
            {position.value && manual.value === null && <HudRow icon={<Icon name="plus" size={18} />} title={`${looked.name} eintragen`} onClick={openAdding} />}
            {token.value && <HudRow icon={<Icon name="close" size={18} />} title="Abmelden" onClick={signOut} />}
            {!token.value && (!position.value || manual.value !== null) && <p>Eintragen geht nur an deinem eigenen Standort.</p>}
          </>
        )}
        <p>Daten: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-Mitwirkende</a></p>
      </HudMenu>
    </OrbisHud>
  );
}
