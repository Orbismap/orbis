import { useRef, useState } from 'preact/hooks';
import { activeKarte } from '../../state/session';
import { viewport } from '../../state/view';
import { Icon } from '../../ui/icons/Icon';
import { Popover } from '../../ui/Popover';
import { regionalReady } from '../../map/basemaps/regional';
import { basemapCredits, sourcesOf, type Credit } from './credits';
import './attribution.css';

/** Thin attribution line at the bottom of the map, plus an info button opening the full details. */
export function Attribution() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const k = activeKarte.value;
  regionalReady.value; // re-render once lazily loaded regional credits exist
  const base = basemapCredits(k.basemap, viewport.value?.bounds);
  const layers = sourcesOf(k.layers.filter((l) => l.visible).map((l) => l.id));

  // Merge basemap and layer credits, de-duplicating by name.
  const byName = new Map<string, Credit>();
  for (const c of [...base, ...layers]) {
    const prev = byName.get(c.name);
    if (prev) {
      prev.layers = [...(prev.layers ?? []), ...(c.layers ?? [])];
      if (!prev.license && c.license) prev.license = c.license;
      if (!prev.licenseUrl && c.licenseUrl) prev.licenseUrl = c.licenseUrl;
    } else {
      byName.set(c.name, { ...c, layers: [...(c.layers ?? [])] });
    }
  }
  const credits = [...byName.values()];

  const shortName = (name: string) => name.replace(/\s*\([^)]*\)/g, '').trim();

  return (
    <div class="attr" ref={wrap}>
      <div class="attr-line" title={credits.map((c) => c.name).join(' · ')}>
        {credits.map((c, i) => {
          const short = shortName(c.name);
          const tip = [short !== c.name ? c.name : null, c.license, c.layers?.length ? c.layers.join(', ') : null, c.licenseUrl].filter(Boolean).join(' · ');
          return (
            <span class="attr-item" key={c.name}>
              {i > 0 && <span class="attr-sep" aria-hidden="true">·</span>}
              <a href={c.url} target="_blank" rel="noopener noreferrer" title={tip || undefined}>
                {short}
              </a>
            </span>
          );
        })}
      </div>
      <button type="button" class="attr-btn" aria-expanded={open} aria-haspopup="dialog" aria-label="Quellen und Lizenzen" onClick={() => setOpen(!open)}>
        <Icon name="info" size={14} />
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