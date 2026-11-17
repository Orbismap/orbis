import { useRef, useState } from 'preact/hooks';
import { MULTI_ALL, multiValues, toggleMulti } from '../layers/multi';
import { cx } from './hooks';
import { Icon } from './icons/Icon';
import './controls.css';

export interface ChoiceListProps<T extends string> {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(v: T): void;
  'aria-label': string;
  /** Multiple choice: `value` is 'all' or comma-joined values (layers/multi.ts), a tap toggles a row, the entry 'all' resets. */
  multiple?: boolean;
  /** From this many entries on the list scrolls instead of growing. */
  maxVisible?: number;
  class?: string;
}

/**
 * Single choice as an open list (radiogroup), Apple style: rounded grouped container, hairline separators, trailing checkmark.
 * One click picks. From more than `maxVisible` entries it scrolls and shows `maxVisible - 0.5` rows, so the cut row says "more",
 * with a fade at the edge that has more content.
 */
export function ChoiceList<T extends string>({ value, options, onChange, multiple, maxVisible = 5, class: cls, ...aria }: ChoiceListProps<T>) {
  const root = useRef<HTMLDivElement>(null);
  // scroll position for the edge fades: more content above / below
  const [edges, setEdges] = useState({ top: false, bottom: true });
  const onScroll = () => {
    const el = root.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    if (top !== edges.top || bottom !== edges.bottom) setEdges({ top, bottom });
  };
  const picked = multiple ? multiValues(value) : null;
  const checked = (v: string) => (multiple ? (v === MULTI_ALL ? picked === null : picked?.includes(v) === true) : v === value);
  const pick = (v: string) => onChange((multiple ? toggleMulti(value, v, options.map((o) => o.value).filter((x) => x !== MULTI_ALL)) : v) as T);
  const move = (dir: number) => {
    const i = Math.max(0, options.findIndex((o) => checked(o.value)));
    const next = options[(i + dir + options.length) % options.length]!;
    if (!multiple) onChange(next.value);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-v="${CSS.escape(next.value)}"]`)?.focus());
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), move(1));
    else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1));
  };
  return (
    <div
      ref={root}
      role={multiple ? 'group' : 'radiogroup'}
      aria-label={aria['aria-label']}
      class={cx('choices', options.length > maxVisible && 'is-scroll', edges.top && 'has-above', edges.bottom && 'has-below', cls)}
      style={{ '--choices-max': maxVisible }}
      onKeyDown={onKey}
      onScroll={onScroll}
    >
      {options.map((o) => (
        <button key={o.value} type="button" role={multiple ? 'checkbox' : 'radio'} data-v={o.value} aria-checked={checked(o.value)} tabIndex={multiple || checked(o.value) ? 0 : -1} class="choice" onClick={() => pick(o.value)}>
          <span class="choice-label">{o.label}</span>
          <Icon name="check" size={14} class="choice-check" />
        </button>
      ))}
    </div>
  );
}
