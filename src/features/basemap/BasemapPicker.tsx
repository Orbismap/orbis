import { useRef, useState } from 'preact/hooks';
import { setBasemap, setLabels, setTerminator } from '../../karten/store';
import { BASEMAPS } from '../../map/basemaps';
import type { BasemapId } from '../../map/types';
import { activeKarte } from '../../state/session';
import { IconButton } from '../../ui/Button';
import { cx } from '../../ui/hooks';
import { Popover } from '../../ui/Popover';
import { Switch } from '../../ui/Switch';
import { Thumb } from './Thumbs';
import './basemap.css';

const IDS: BasemapId[] = ['orbis-dark', 'orbis-light', 'satellite', 'terrain', 'bluemarble'];

/** Button + popover: five basemaps with thumbnails, labels and day/night shading. Applies to the active Karte. */
export function BasemapPicker({ side = 'down' }: { side?: 'down' | 'left' }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const k = activeKarte.value;
  return (
    <div class="bm" ref={wrap}>
      <IconButton icon="layers" label="Grundkarte" variant="ghost" aria-haspopup="dialog" aria-expanded={open} pressed={open} onClick={() => setOpen(!open)} place={side === 'left' ? 'left' : 'bottom'} />
      <Popover open={open} onClose={() => setOpen(false)} align="end" class={cx('bm-pop', side === 'left' && 'bm-left')} label="Grundkarte" anchorRef={wrap}>
        <div class="bm-grid" role="radiogroup" aria-label="Grundkarte">
          {IDS.map((id) => (
            <button key={id} type="button" role="radio" aria-checked={k.basemap === id} class="bm-opt" onClick={() => setBasemap(k.id, id)}>
              <span class="bm-thumb">
                <Thumb id={id} />
              </span>
              <span class="bm-name">{BASEMAPS[id].label}</span>
            </button>
          ))}
        </div>
        <div class="bm-switches">
          <Switch label="Beschriftung" checked={k.labels} onChange={(v) => setLabels(k.id, v)} />
          <Switch label="Tag und Nacht" checked={k.terminator} onChange={(v) => setTerminator(k.id, v)} />
        </div>
      </Popover>
    </div>
  );
}
