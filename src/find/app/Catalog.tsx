// "Was suchst du?": big pictures to pick from, over the whole screen.
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from '@/ui/icons/Icon';
import { ART } from '../data/art';
import { CATALOG } from '../data/catalog';
import { kind } from '../state/finder';
import { PictureTile } from './PictureTile';

export function Catalog({ onClose }: { onClose(): void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  return (
    <div class="find-catalog" role="dialog" aria-modal="true" aria-labelledby="find-catalog-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div class="find-catalog-body">
        <header>
          <h1 id="find-catalog-title">Was suchst du?</h1>
          <button ref={close} type="button" class="find-close" aria-label="Schließen" onClick={onClose}><Icon name="close" size={20} /></button>
        </header>
        {/* announced: searching any place of the map by name */}
        <input class="find-free" type="search" disabled aria-label="Freie Suche, kommt bald" placeholder="Freie Suche – kommt bald" />
        {CATALOG.map((group) => (
          <section key={group.title}>
            <h2>{group.title}</h2>
            <ul>
              {group.entries.map((e) => (
                <li key={e.art}>
                  <PictureTile art={ART[e.art]} colour={e.colour} name={e.name} soon={!e.kind} selected={e.kind === kind} onClick={() => { if (e.kind) onClose(); }} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
