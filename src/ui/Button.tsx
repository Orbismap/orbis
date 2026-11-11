import type { ComponentChildren, JSX } from 'preact';
import { cx } from './hooks';
import { Icon } from './icons/Icon';
import type { UiIconName } from './icons/paths';
import { tipProps, type TipState } from './tip-state';
import './button.css';

type Native = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'size'>;

export interface ButtonProps extends Native {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive';
  icon?: UiIconName;
  block?: boolean;
  children?: ComponentChildren;
}

/** Text button with optional leading icon. Min hit area follows --hit (28 px mouse, 44 px touch). */
export function Button({ variant = 'secondary', icon, block, class: cls, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} class={cx('btn', `btn-${variant}`, block && 'btn-block', cls as string)} {...rest}>
      {icon && <Icon name={icon} size={16} />}
      {children && <span class="btn-label">{children}</span>}
    </button>
  );
}

export interface IconButtonProps extends Native {
  icon: UiIconName;
  /** Accessible name and tooltip text. */
  label: string;
  shortcut?: string;
  variant?: 'ghost' | 'solid' | 'round';
  pressed?: boolean;
  size?: number;
  place?: TipState['place'];
}

/** Square icon-only button with tooltip (desktop) and shortcut hint. */
export function IconButton({ icon, label, shortcut, variant = 'ghost', pressed, size = 20, place, class: cls, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      class={cx('iconbtn', `iconbtn-${variant}`, cls as string)}
      aria-label={label}
      aria-pressed={pressed}
      {...tipProps(label, shortcut, place)}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}
