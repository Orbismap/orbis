import type { JSX } from 'preact';
import { cx } from './hooks';
import { Icon } from './icons/Icon';
import './controls.css';

export interface SelectProps<T extends string> extends Omit<JSX.HTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'size'> {
  value: T;
  /** `group` renders consecutive options with the same group as one <optgroup>. */
  options: readonly { value: T; label: string; group?: string }[];
  onChange(v: T): void;
  'aria-label'?: string;
}

/** Native <select> with the Orbis skin: keeps platform pickers on touch, full keyboard support everywhere. */
export function Select<T extends string>({ value, options, onChange, class: cls, ...rest }: SelectProps<T>) {
  return (
    <span class={cx('select', cls as string)}>
      <select value={value} onChange={(e) => onChange((e.currentTarget as HTMLSelectElement).value as T)} {...rest}>
        {grouped(options).map(([group, opts]) => {
          const list = opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ));
          return group === undefined ? list : <optgroup label={group}>{list}</optgroup>;
        })}
      </select>
      <Icon name="chevron-down" size={14} class="select-caret" />
    </span>
  );
}

function grouped<O extends { group?: string }>(options: readonly O[]): [string | undefined, O[]][] {
  const out: [string | undefined, O[]][] = [];
  for (const o of options) {
    const last = out[out.length - 1];
    if (last && last[0] === o.group && o.group !== undefined) last[1].push(o);
    else out.push([o.group, [o]]);
  }
  return out;
}
