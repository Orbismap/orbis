import { useRef, useState } from 'preact/hooks';
import { activeKarte } from '../../state/session';
import { viewport } from '../../state/view';
import { Icon } from '../../ui/icons/Icon';
import { Popover } from '../../ui/Popover';
import { regionalReady } from '../../map/basemaps/regional';
import { basemapCredits, sourcesOf } from './credits';
import './attribution.css';

/** Compact attribution, always visible; expands on click to basemap and active layer sources. */
export function Attribution() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const k = activeKarte.value;
  regionalReady.value; // re-render once lazily loaded regional credits exist
  const base = basemapCredits(k.basemap, viewport.value?.bounds);
  const layers = sourcesOf(k.layers.filter((l) => l.visible).map((l) => l.id));
  return (
    <div class="attr" ref={wrap}>
      <button type="button" class="attr-btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
        <Icon name="info" size={14} />
        <span>Quellen</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} align="end" up label="Quellen und Lizenzen" anchorRef={wrap} class="attr-pop">
        <div class="attr-body">
          <h3>Karte</h3>
          <ul role="list">
            {base.map((c) => (
              <li key={c.name}>
                <a href={c.url} target="_blank" rel="noopener noreferrer">
                  {c.name}
                </a>
                {c.license && <span>{c.license}</span>}
                {c.licenseUrl && (
                  <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer">
                    Lizenz
                  </a>
                )}
              </li>
            ))}
          </ul>
          {layers.length > 0 && (
            <>
              <h3>Daten der aktiven Ebenen</h3>
              <ul role="list">
                {layers.map((c) => (
                  <li key={c.name}>
                    <a href={c.url} target="_blank" rel="noopener noreferrer">
                      {c.name}
                    </a>
                    <span>{[c.license, c.layers?.join(', ')].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Popover>
    </div>
  );
}
