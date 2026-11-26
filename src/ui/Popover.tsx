import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { IconButton } from './Button';
import { cx, useEscape, useOutside } from './hooks';
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
  style?: Record<string, string | number>;
}

/** The map app marks phones on <html> (app/App.tsx). */
const onPhone = () => typeof document !== 'undefined' && document.documentElement.dataset.bp === 'mobile';

/**
 * Anchored popover: Escape and outside press close it, focus returns to the anchor's first button.
 * On phones it is an action sheet instead: docked to the bottom above a scrim, outside every panel, so that nothing clips
 * it or lies on top of it; `align`, `up` and `style` do not apply there.
 */
export function Popover({ open, onClose, children, align = 'start', up, class: cls, label, anchorRef, menu, style }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const phone = onPhone();
  useEscape(open, onClose);
  // the action sheet closes by its scrim: closing on pointerdown would let the following click hit what lies underneath
  useOutside(open && !phone, anchorRef ?? ref, onClose);
  useEffect(() => {
    if (open && menu) ref.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, [open, menu]);
  if (!open) return null;
  const onKey = (e: KeyboardEvent) => {
    if (!menu) return;
    const items = [...ref.current!.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') (e.preventDefault(), items[(i + 1) % items.length]?.focus());
    else if (e.key === 'ArrowUp') (e.preventDefault(), items[(i - 1 + items.length) % items.length]?.focus());
    else if (e.key === 'Home') (e.preventDefault(), items[0]?.focus());
    else if (e.key === 'End') (e.preventDefault(), items[items.length - 1]?.focus());
  };
  const box = (
    <div ref={ref} class={cx('popover', `popover-${align}`, up && 'popover-up', phone && 'popover-sheet', cls)} style={phone ? undefined : style} role={menu ? 'menu' : 'dialog'} aria-label={label} onKeyDown={onKey}>
      {phone && (
        <div class="popover-head" role="presentation">
          <span class="popover-title">{label}</span>
          <IconButton icon="close" label="Schließen" onClick={onClose} />
        </div>
      )}
      {children}
    </div>
  );
  if (!phone) return box;
  return createPortal(
    <div class="popover-layer" onClick={(e) => e.target === e.currentTarget && onClose()}>
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
