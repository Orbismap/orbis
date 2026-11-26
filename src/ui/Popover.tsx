import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { IconButton } from './Button';
import { cx, useEscape, useLatest, useOutside } from './hooks';
import { placeMenu } from './menu-place';
import { sheetPanel, sheetPanelHost } from './sheet-panel';
import { useSwipeDown } from './swipe-dismiss';
import { Icon } from './icons/Icon';
import type { UiIconName } from './icons/paths';
import './popover.css';

export interface PopoverProps {
  open: boolean;
  onClose(): void;
  children: ComponentChildren;
  /** Edge of the (position: relative) parent the popover aligns to. */
  align?: 'start' | 'end';
  /** Opens above the anchor. */
  up?: boolean;
  class?: string;
  label: string;
  /** Element(s) that toggle it; clicks on them are not "outside". */
  anchorRef?: { current: HTMLElement | null };
  menu?: boolean;
  /** Phones: settings to browse, not a choice to make — they show as a page of the app's sheet. */
  page?: boolean;
  /** Phones: a question about an action. Its own "Abbrechen" closes it, so the sheet needs no head. */
  actions?: boolean;
  style?: Record<string, string | number>;
}

/** The map app marks phones on <html> (app/App.tsx). */
const onPhone = () => typeof document !== 'undefined' && document.documentElement.dataset.bp === 'mobile';

type Phone = 'menu' | 'sheet' | 'page' | undefined;

/**
 * What a menu or sheet over the app does beyond looking like one: it takes the focus and gives it back, and what lies
 * behind it (marked `data-behind-modal`) can neither be touched nor reached by a screen reader.
 */
function useModal(ref: { current: HTMLElement | null }, mode: Phone) {
  const active = mode === 'menu' || mode === 'sheet';
  useEffect(() => {
    if (!active) return;
    const box = ref.current!;
    const before = document.activeElement as HTMLElement | null;
    if (!box.contains(before)) box.focus({ preventScroll: true });
    const behind = [...document.querySelectorAll<HTMLElement>('[data-behind-modal]')].filter((n) => !n.inert);
    for (const n of behind) n.inert = true;
    return () => {
      for (const n of behind) n.inert = false;
      const now = document.activeElement;
      if (before?.isConnected && (!now || now === document.body || box.contains(now))) before.focus({ preventScroll: true });
    };
  }, [mode]);
}

let pages = 0;
/** Registers the popover as a page of the sheet while it is open; the focus returns to its button afterwards. */
function useSheetPage(active: boolean, label: string, cls: string | undefined, onClose: () => void) {
  const close = useLatest(onClose);
  useEffect(() => {
    if (!active) return;
    const key = `panel-${++pages}`;
    const before = document.activeElement as HTMLElement | null;
    sheetPanel.peek()?.close(); // one panel at a time
    sheetPanel.value = { key, label, class: cls, close: () => close.current() };
    return () => {
      if (sheetPanel.peek()?.key === key) sheetPanel.value = null;
      // the button only shows again with the next frame
      requestAnimationFrame(() => document.activeElement === document.body && before?.focus({ preventScroll: true }));
    };
  }, [active]);
}

/**
 * Anchored popover: Escape and outside press close it, focus returns to the anchor's first button.
 * On phones it is one of three things: a menu at its button (`menu`), a page of the sheet (`page`), or else a sheet
 * docked to the bottom above a scrim — a form, or with `actions` a question about an action. Menu and sheet are modal
 * and lie outside every panel, so that nothing clips them or lies on top; `up` and `style` do not apply there.
 */
export function Popover({ open, onClose, children, align = 'start', up, class: cls, label, anchorRef, menu, page, actions, style }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const phone = onPhone();
  const mode: Phone = !phone || !open ? undefined : page ? 'page' : menu ? 'menu' : 'sheet';
  useEscape(open, onClose);
  // on phones the layer behind closes it: closing on pointerdown would let the following click hit what lies underneath
  useOutside(open && !phone, anchorRef ?? ref, onClose);
  // before the menu takes the focus: the modal remembers where it was
  useModal(ref, mode);
  useEffect(() => {
    if (open && menu) ref.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, [open, menu]);
  useSwipeDown(ref, mode === 'sheet', onClose);
  useSheetPage(mode === 'page', label, cls, onClose);
  const host = mode === 'page' ? sheetPanelHost.value : null;
  if (!open) return null;
  if (mode === 'page') return host ? createPortal(<>{children}</>, host) : null;
  const onKey = (e: KeyboardEvent) => {
    if (!menu) return;
    const items = [...ref.current!.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') (e.preventDefault(), items[(i + 1) % items.length]?.focus());
    else if (e.key === 'ArrowUp') (e.preventDefault(), items[(i - 1 + items.length) % items.length]?.focus());
    else if (e.key === 'Home') (e.preventDefault(), items[0]?.focus());
    else if (e.key === 'End') (e.preventDefault(), items[items.length - 1]?.focus());
  };
  const anchor = anchorRef?.current;
  const at = mode === 'menu' && anchor ? placeMenu(anchor.getBoundingClientRect(), { width: innerWidth, height: innerHeight }, align) : undefined;
  const box = (
    <div
      ref={ref}
      class={cx('popover', !phone && `popover-${align}`, !phone && up && 'popover-up', mode && `popover-${mode}`, actions && mode && 'popover-actions', cls)}
      style={
        !phone
          ? style
          : at
            ? { left: `${at.left}px`, width: `${at.width}px`, ...(at.top !== undefined ? { top: `${at.top}px`, maxHeight: `calc(${at.room}px - env(safe-area-inset-bottom))` } : { bottom: `${at.bottom}px`, maxHeight: `calc(${at.room}px - env(safe-area-inset-top))` }) }
            : undefined
      }
      role={menu ? 'menu' : 'dialog'}
      aria-modal={mode === 'sheet' || undefined}
      tabIndex={phone ? -1 : undefined}
      aria-label={label}
      onKeyDown={onKey}
    >
      {mode === 'sheet' && !actions && (
        <div class="popover-head">
          <span class="popover-title">{label}</span>
          <IconButton icon="close" label="Schließen" onClick={onClose} />
        </div>
      )}
      {children}
    </div>
  );
  if (!phone) return box;
  return createPortal(
    <div key={mode} class={cx('popover-layer', mode === 'menu' && 'is-menu')} onClick={(e) => e.target === e.currentTarget && onClose()}>
      {box}
    </div>,
    document.body,
  );
}

export function MenuItem({ icon, children, onClick, danger, disabled, checked, hint }: { icon?: UiIconName; children: ComponentChildren; onClick(): void; danger?: boolean; disabled?: boolean; checked?: boolean; hint?: string }) {
  return (
    <button type="button" role={checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={checked} class={cx('menuitem', danger && 'is-danger')} disabled={disabled} onClick={onClick}>
      <span class="menuitem-icon">{icon ? <Icon name={icon} size={16} /> : checked ? <Icon name="check" size={16} /> : null}</span>
      <span class="menuitem-label">{children}</span>
      {hint && <span class="menuitem-hint">{hint}</span>}
    </button>
  );
}

export const MenuSeparator = () => <div class="menu-sep" role="separator" />;
