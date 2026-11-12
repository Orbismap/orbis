import { useRef, useState } from 'preact/hooks';
import { isDirty } from '../../karten/store';
import { activeKarte } from '../../state/session';
import { Icon } from '../../ui/icons/Icon';
import { KartenPopover } from './actions';
import './karten-bar.css';

/** Mobile: pill that shows the active Karte and opens "Alle Karten" (list with the actions of each Karte). */
export function KartenSwitcher() {
  const active = activeKarte.value;
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  return (
    <div class="kswitch" ref={anchor}>
      <button type="button" class="kswitch-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} data-nodrag>
        <span class="kswitch-name">{active.name}</span>
        {isDirty(active.id) && <span class="kbar-dirty" role="img" aria-label="geändert" />}
        <Icon name="chevron-down" size={16} />
      </button>
      <KartenPopover open={open} onClose={() => setOpen(false)} anchor={anchor} align="start" up class="kswitch-pop" />
    </div>
  );
}
