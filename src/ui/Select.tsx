import type { JSX } from 'preact';
import { cx } from './hooks';
import { Icon } from './icons/Icon';
import './controls.css';

export interface SelectProps<T extends string> extends Omit<JSX.HTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'size'> {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(v: T): void;
  'aria-label'?: string;
}

/** Native <select> with the Orbis skin: keeps platform pickers on touch, full keyboard support everywhere. */
export function Select<T extends string>({ value, options, onChange, class: cls, ...rest }: SelectProps<T>) {
  return (
    <span class={cx('select', cls as string)}>
      <select value={value} onChange={(e) => onChange((e.currentTarget as HTMLSelectElement).value as T)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={14} class="select-caret" />
    </span>
  );
}
