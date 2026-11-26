import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../../ui/icons/Icon';
import { tipProps } from '../../ui/tip-state';
import { isMobile, settingsKeyFocus } from '../../state/ui';
import { projection } from '../../state/view';
import { cx } from '../../ui/hooks';
import { Popover } from '../../ui/Popover';
import { goToMyLocation } from '../tools/my-location';
import { PickerBody, usePickerState } from './picker-parts';
import './basemap.css';

/** px between the popover and the edge of the window */
const EDGE = 12;

/**
 * Top rail button (icon shows the current projection) that opens the basemap popover: the modes in the first row, the maps of the
 * shown mode below, then the regional maps and the view switches. Applies to the active Karte.
 */
export function BasemapPicker({ side = 'down' }: { side?: 'down' | 'left' }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const globe = projection.value === 'globe';
  const pv = usePickerState(open);
  // a locked map leads to the key field in the settings: on phones the action sheet would cover it
  const keyAsked = settingsKeyFocus.value;
  useEffect(() => {
    if (keyAsked && isMobile.peek()) setOpen(false);
  }, [keyAsked]);
  const close = () => {
    // give focus back to the rail button when it was inside the popover (Escape) or nowhere
    const a = document.activeElement;
    if (!a || a === document.body || wrap.current?.contains(a)) btn.current?.focus();
    setOpen(false);
  };
  // opening downwards, the popover reaches up to the top of the window (as far as it needs), not just to its button
  const top = open && side === 'down' ? wrap.current?.getBoundingClientRect().top : undefined;
  const style = top === undefined ? undefined : { top: `${-Math.max(0, top - EDGE)}px`, maxHeight: `min(760px, calc(100dvh - ${2 * EDGE}px))` };
  return (
    <div class="bm" ref={wrap}>
      <div class="cap rail-cap rail-stack">
        <button
          ref={btn}
          type="button"
          class="railbtn"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-pressed={open}
          aria-label={`Grundkarte und Ansicht, aktuell ${globe ? 'Globus' : 'flache Karte'}`}
          onClick={() => (open ? close() : setOpen(true))}
          {...tipProps('Grundkarte und Ansicht', undefined, 'left')}
        >
          <Icon name={globe ? 'globe' : 'map'} size={20} />
        </button>
        <span class="rail-hair" aria-hidden="true" />
        <button type="button" class="railbtn" aria-label="Zum eigenen Standort" onClick={goToMyLocation} {...tipProps('Mein Standort', undefined, 'left')}>
          <Icon name="navigate" size={20} />
        </button>
      </div>
      <Popover open={open} onClose={close} align="end" class={cx('bm-pop', 'bm-left', side === 'left' && 'bm-up')} style={style} label="Grundkarte und Ansicht" anchorRef={wrap}>
        {pv && <PickerBody pv={pv} />}
      </Popover>
    </div>
  );
}
