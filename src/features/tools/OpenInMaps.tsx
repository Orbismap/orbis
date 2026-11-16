import { useRef, useState } from 'preact/hooks';
import { camera } from '../../state/view';
import { settings } from '../../state/settings';
import { Icon } from '../../ui/icons/Icon';
import { Popover, MenuItem } from '../../ui/Popover';
import { tipProps } from '../../ui/tip-state';
import { cx } from '../../ui/hooks';
import { appleMapsUrl, googleMaps3dUrl, osmUrl } from './external-maps';
import './open-in-maps.css';

// always a new tab, never this one (with `noopener` window.open returns null, so its result says nothing about being blocked)
const openUrl = (url: string) => {
  window.open(url, '_blank', 'noopener');
};

/** Button + menu that hands the current camera to Apple Maps / Google Maps. */
export function OpenInMaps({ popoverUp }: { popoverUp?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  if (!settings.value.debug) return null;
  const close = () => {
    const a = document.activeElement;
    if (a && wrap.current?.contains(a)) (wrap.current.querySelector('button') as HTMLElement | null)?.focus();
    setOpen(false);
  };
  return (
    <div class="oim" ref={wrap}>
      <div class="cap rail-cap">
        <button
          type="button"
          class="railbtn"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="In externer Karte öffnen"
          onClick={() => (open ? close() : setOpen(true))}
          {...tipProps('In externer Karte öffnen', undefined, 'left')}
        >
          <Icon name="external" size={20} />
        </button>
      </div>
      <Popover open={open} onClose={close} align="end" menu class={cx('oim-pop', 'oim-left', popoverUp && 'oim-up')} label="In externer Karte öffnen" anchorRef={wrap}>
        <MenuItem icon="map" onClick={() => { openUrl(appleMapsUrl(camera.peek())); close(); }} hint="Position, Drehung, Neigung">
          Apple Maps
        </MenuItem>
        <MenuItem icon="map" onClick={() => { openUrl(googleMaps3dUrl(camera.peek())); close(); }} hint="Position, Drehung, Neigung">
          Google Maps
        </MenuItem>
        <MenuItem icon="map" onClick={() => { openUrl(osmUrl(camera.peek())); close(); }} hint="Position, Zoom">
          OpenStreetMap
        </MenuItem>
      </Popover>
    </div>
  );
}