import { useRef, useState } from 'preact/hooks';
import { isDirty, karten } from '../../karten/store';
import { activeKarte, setActiveKarte } from '../../state/session';
import { Icon } from '../../ui/icons/Icon';
import { MenuItem, MenuSeparator, Popover } from '../../ui/Popover';
import { KartenActions } from './actions';
import './karten-bar.css';

/** Mobile: pill that shows the active Karte and opens the list of Karten (plus their actions). */
export function KartenSwitcher() {
  const active = activeKarte.value;
  const [open, setOpen] = useState(false);
  const [actions, setActions] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  return (
    <div class="kswitch" ref={anchor}>
      <button type="button" class="kswitch-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} data-nodrag>
        <span class="kswitch-name">{active.name}</span>
        {isDirty(active.id) && <span class="kbar-dirty" role="img" aria-label="geändert" />}
        <Icon name="chevron-down" size={16} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} up label="Karten" menu anchorRef={anchor} class="kswitch-pop">
        {karten.value.map((k) => (
          <MenuItem
            key={k.id}
            checked={k.id === active.id}
            onClick={() => {
              setActiveKarte(k.id);
              setOpen(false);
            }}
          >
            {k.name}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem
          icon="more"
          onClick={() => {
            setOpen(false);
            setActions(true);
          }}
        >
          Diese Karte verwalten
        </MenuItem>
      </Popover>
      <KartenActions karte={active} open={actions} onClose={() => setActions(false)} align="start" up anchor={anchor} />
    </div>
  );
}
