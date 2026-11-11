import { useEffect, useRef, useState } from 'preact/hooks';
import { isDirty, karten, resetKarte } from '../../karten/store';
import { activeKarte, setActiveKarte } from '../../state/session';
import { IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons/Icon';
import { cx } from '../../ui/hooks';
import { tipProps } from '../../ui/tip-state';
import { KartenActions } from './actions';
import './karten-bar.css';

/**
 * Desktop: capsule of Karten tabs. The active tab shows icon and name, the others only their icon (tooltip and
 * aria-label carry the name), so all five standard Karten fit; own Karten scroll. Keys 1-5 switch builtins.
 */
export function KartenBar() {
  const list = karten.value;
  const active = activeKarte.value;
  const dirty = isDirty(active.id);
  const strip = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const menuBtn = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [active.id, list.length]);

  const onKey = (e: KeyboardEvent) => {
    const i = list.findIndex((k) => k.id === active.id);
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = list[(i + d + list.length) % list.length]!;
    setActiveKarte(next.id);
    requestAnimationFrame(() => strip.current?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus());
  };

  return (
    <div class="kbar-row">
      <div class="kbar" role="tablist" aria-label="Karten" ref={strip} onKeyDown={onKey}>
        {list.map((k, i) => {
          const sel = k.id === active.id;
          const label = i < 5 ? `${k.name} (Taste ${i + 1})` : k.name;
          return (
            <button
              key={k.id}
              type="button"
              role="tab"
              data-id={k.id}
              aria-selected={sel}
              aria-label={k.name}
              tabIndex={sel ? 0 : -1}
              class={cx('ktab', sel && 'is-active')}
              onClick={() => setActiveKarte(k.id)}
              {...(sel ? {} : tipProps(label, undefined, 'bottom'))}
            >
              <Icon name={k.icon} size={17} />
              <span class="ktab-label">{k.name}</span>
              {isDirty(k.id) && <span class="kbar-dirty" role="img" aria-label="geändert" />}
            </button>
          );
        })}
      </div>
      <div class="kbar-tools" ref={menuBtn}>
        {dirty && <IconButton icon="reset" label="Zurücksetzen" onClick={() => resetKarte(active.id)} />}
        <IconButton icon="more" label="Kartenmenü" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} />
        <KartenActions karte={active} open={menu} onClose={() => setMenu(false)} anchor={menuBtn} />
      </div>
    </div>
  );
}
