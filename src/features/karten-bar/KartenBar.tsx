import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { createKarte, isDirty, listedKarten } from '../../karten/store';
import { activeKarte, setActiveKarte } from '../../state/session';
import { Icon } from '../../ui/icons/Icon';
import { cx } from '../../ui/hooks';
import { KartenChangeRow, KartenPopover } from './actions';
import './karten-bar.css';

const NEW = '__new';
const MENU_W = 280;
const LONG_PRESS = 500;

/**
 * Desktop: capsule with all Karten as tabs spread over the full width. The active tab is a pill with icon and name,
 * the others show only their icon. If they do not fit even at minimum width the strip scrolls sideways (soft edges).
 * A click on the active pill, a right click or a long press opens the actions of that Karte.
 */
export function KartenBar() {
  const list = listedKarten.value;
  const active = activeKarte.value;
  const row = useRef<HTMLDivElement>(null);
  const clip = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ id: string; left: number } | null>(null);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const suppress = useRef(false);

  const tabEl = (id: string) => tabs.current?.querySelector<HTMLElement>(`[data-id="${id}"]`) ?? null;
  const focusTab = (id: string) => requestAnimationFrame(() => tabEl(id)?.focus());

  const openMenu = (id: string) => {
    const el = tabEl(id);
    const r = row.current;
    if (!el || !r) return;
    const a = el.getBoundingClientRect();
    const b = r.getBoundingClientRect();
    setMenu({ id, left: Math.max(0, Math.min(a.left - b.left, b.width - MENU_W)) });
  };
  const closeMenu = (refocus = true) => {
    const id = menu?.id;
    setMenu(null);
    if (refocus && id) focusTab(id);
  };

  // edge fades only where content continues; wheel scrolls sideways
  useLayoutEffect(() => {
    const el = clip.current;
    if (!el) return;
    const update = () => {
      el.dataset.l = String(el.scrollLeft > 1);
      el.dataset.r = String(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    const onScroll = () => {
      update();
      setMenu((m) => (m ? null : m));
    };
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    update();
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (tabs.current) ro.observe(tabs.current);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      ro.disconnect();
    };
  }, []);

  // keep the active tab in view (again after its label has expanded)
  useEffect(() => {
    const reveal = () => {
      const el = clip.current;
      const t = tabEl(active.id);
      if (!el || !t) return;
      const c = el.getBoundingClientRect();
      const r = t.getBoundingClientRect();
      const pad = 24;
      if (r.left < c.left + pad) el.scrollLeft += r.left - c.left - pad;
      else if (r.right > c.right - pad) el.scrollLeft += r.right - c.right + pad;
    };
    const f = requestAnimationFrame(reveal);
    const t = window.setTimeout(reveal, 230);
    return () => {
      cancelAnimationFrame(f);
      clearTimeout(t);
    };
  }, [active.id, list.length]);

  useEffect(() => () => press.current && clearTimeout(press.current.timer), []);

  const onKey = (e: KeyboardEvent) => {
    const cur = (document.activeElement as HTMLElement | null)?.dataset.id;
    if (!cur) return;
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      if (cur === NEW) return;
      e.preventDefault();
      openMenu(cur);
      return;
    }
    const ids = [...list.map((k) => k.id), NEW];
    const at = ids.indexOf(cur);
    const next = e.key === 'ArrowRight' ? ids[(at + 1) % ids.length] : e.key === 'ArrowLeft' ? ids[(at - 1 + ids.length) % ids.length] : e.key === 'Home' ? ids[0] : e.key === 'End' ? ids[ids.length - 1] : undefined;
    if (!next) return;
    e.preventDefault();
    tabEl(next)?.focus();
  };

  const select = (id: string) => {
    if (suppress.current) {
      suppress.current = false;
      return;
    }
    if (id === active.id) {
      if (menu?.id === id) closeMenu(false);
      else openMenu(id);
      return;
    }
    setMenu(null);
    setActiveKarte(id);
  };

  const pressProps = (id: string) => ({
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const x = e.clientX;
      const y = e.clientY;
      const timer = window.setTimeout(() => {
        press.current = null;
        suppress.current = true;
        openMenu(id);
      }, LONG_PRESS);
      press.current = { timer, x, y };
    },
    onPointerMove: (e: PointerEvent) => {
      const p = press.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) {
        clearTimeout(p.timer);
        press.current = null;
      }
    },
    onPointerUp: () => {
      if (press.current) clearTimeout(press.current.timer);
      press.current = null;
    },
    onPointerCancel: () => {
      if (press.current) clearTimeout(press.current.timer);
      press.current = null;
    },
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      suppress.current = false;
      openMenu(id);
    },
  });

  return (
    <>
      <div class="kbar-row" ref={row}>
        <div class="kbar" onKeyDown={onKey}>
          <div class="kbar-clip" ref={clip} data-l="false" data-r="false">
            <div class="kbar-tabs" role="tablist" aria-label="Karten" ref={tabs}>
              {list.map((k) => {
                const sel = k.id === active.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    role="tab"
                    data-id={k.id}
                    aria-selected={sel}
                    aria-label={k.name}
                    {...(sel ? { 'aria-haspopup': 'menu', 'aria-expanded': menu?.id === k.id } : { title: k.name })}
                    tabIndex={sel ? 0 : -1}
                    class={cx('ktab', sel && 'is-active')}
                    onClick={() => select(k.id)}
                    {...pressProps(k.id)}
                  >
                    <Icon name={k.icon} size={17} />
                    {sel && (
                      <>
                        <span class="ktab-label" aria-hidden="true">
                          <span class="ktab-name">{k.name}</span>
                        </span>
                        {isDirty(k.id) && <span class="kbar-dirty" role="img" aria-label="geändert" />}
                        <Icon name="chevron-down" size={12} class="ktab-chev" />
                      </>
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                role="tab"
                data-id={NEW}
                aria-selected={false}
                aria-label="Neue Karte"
                title="Neue Karte"
                tabIndex={-1}
                class="ktab ktab-new"
                onClick={() => {
                  setMenu(null);
                  setActiveKarte(createKarte());
                }}
              >
                <Icon name="plus" size={17} />
              </button>
            </div>
          </div>
        </div>
        {menu && <KartenPopover key={menu.id} open onClose={() => closeMenu()} anchor={row} only={menu.id} align="start" class="kbar-menu" style={{ left: `${menu.left}px` }} />}
      </div>
      <KartenChangeRow />
    </>
  );
}
