// The left menu of the Orbis apps with what this one offers: what to look for and where to start from.
import { useEffect } from 'preact/hooks';
import { HudPill, OrbisHud } from '@/ui/hud/OrbisHud';
import { Icon } from '@/ui/icons/Icon';
import type { UiIconName } from '@/ui/icons/paths';
import { kind } from '../state/finder';
import { canEdit, signOut, token } from '../state/osm';
import { manual, position } from '../state/sensors';
import { browsing, menuOpen, openAdding, openCatalogue, openSearch, useMyPosition } from '../state/ui';

function Row({ icon, title, note, current, onClick }: { icon: UiIconName; title: string; note?: string; current?: boolean; onClick(): void }) {
  return (
    <button type="button" class="find-row" aria-pressed={current} onClick={onClick}>
      <Icon name={icon} size={18} />
      <span>
        {title}
        {note && <small>{note}</small>}
      </span>
      {current && <Icon name="check" size={14} />}
    </button>
  );
}

export function Menu() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'b') return;
      e.preventDefault();
      menuOpen.value = !menuOpen.value;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <OrbisHud
      project="find" fixed open={menuOpen.value} onOpenChange={(open) => (menuOpen.value = open)}
      beside={<HudPill icon={<Icon name={kind.icon} size={19} />} label={kind.name} title={`Gesucht: ${kind.name} – ändern`} expanded={browsing.value} onClick={openCatalogue} />}
    >
      <nav class="find-menu" aria-label="Orbis Find">
        <h2>Finden</h2>
        <Row icon={kind.icon} title={kind.name} current onClick={openCatalogue} />
        <h2>Start</h2>
        <Row icon="locate" title="Mein Standort" current={manual.value === null} onClick={useMyPosition} />
        <Row icon="search" title="Ort suchen" note={manual.value ?? undefined} current={manual.value !== null} onClick={openSearch} />
        {canEdit && kind.add && (
          <>
            <h2>OpenStreetMap</h2>
            {position.value && manual.value === null && <Row icon="plus" title={`${kind.name} eintragen`} onClick={openAdding} />}
            {token.value && <Row icon="close" title="Abmelden" onClick={signOut} />}
            {!token.value && (!position.value || manual.value !== null) && <p>Eintragen geht nur an deinem eigenen Standort.</p>}
          </>
        )}
        <p>Daten: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-Mitwirkende</a></p>
      </nav>
    </OrbisHud>
  );
}
