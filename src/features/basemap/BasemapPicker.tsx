import { useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Icon } from '../../ui/icons/Icon';
import { tipProps } from '../../ui/tip-state';
import { projection } from '../../state/view';
import { cx } from '../../ui/hooks';
import { Popover } from '../../ui/Popover';
import { BasemapFull, type Rect } from './BasemapFull';
import { PickerBody, usePickerState } from './picker-parts';
import './basemap.css';

/**
 * Top rail button (icon shows the current projection) that opens the basemap and view popover, which can grow into a large view
 * (a modal) for the many maps. Applies to the active Karte.
 */
export function BasemapPicker({ side = 'down' }: { side?: 'down' | 'left' }) {
  const [open, setOpen] = useState(false);
  /** where the popover was when it turned into the large view (set while that is shown) */
  const [from, setFrom] = useState<Rect | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const globe = projection.value === 'globe';
  const s = usePickerState(open || !!from);
  const close = () => {
    // give focus back to the rail button when it was inside the popover (Escape) or nowhere
    const a = document.activeElement;
    if (!a || a === document.body || wrap.current?.contains(a)) btn.current?.focus();
    setOpen(false);
  };
  const expand = () => {
    const r = wrap.current?.querySelector('.bm-pop')?.getBoundingClientRect();
    if (!r) return;
    setFrom({ left: r.left, top: r.top, width: r.width, height: r.height });
    setOpen(false);
  };
  /** the large view has shrunk back to where the popover was: the popover takes over */
  const collapsed = () => {
    setFrom(null);
    setOpen(true);
  };
  return (
    <div class="bm" ref={wrap}>
      <div class="cap rail-cap">
        <button
          ref={btn}
          type="button"
          class="railbtn"
          aria-haspopup="dialog"
          aria-expanded={open || !!from}
          aria-pressed={open || !!from}
          aria-label={`Grundkarte und Ansicht, aktuell ${globe ? 'Globus' : 'flache Karte'}`}
          onClick={() => !from && (open ? close() : setOpen(true))}
          {...tipProps('Grundkarte und Ansicht', undefined, 'left')}
        >
          <Icon name={globe ? 'globe' : 'map'} size={20} />
        </button>
      </div>
      <Popover open={open} onClose={close} align="end" class={cx('bm-pop', 'bm-left', side === 'left' && 'bm-up')} label="Grundkarte und Ansicht" anchorRef={wrap}>
        {s && <PickerBody s={s} onExpand={expand} />}
      </Popover>
      {from && s && createPortal(<BasemapFull from={from} s={s} onClosed={collapsed} />, document.body)}
    </div>
  );
}
