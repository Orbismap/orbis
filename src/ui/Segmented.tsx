import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { cx, useUid } from './hooks';
import './controls.css';

export interface SegmentedOption<T extends string> { value: T; label: ComponentChildren; title?: string }

export interface SegmentedProps<T extends string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange(v: T): void;
  'aria-label': string;
  size?: 'sm' | 'md';
  block?: boolean;
  class?: string;
}

/** Single-choice control (radiogroup) with arrow-key roving focus. */
export function Segmented<T extends string>({ value, options, onChange, size = 'md', block, class: cls, ...aria }: SegmentedProps<T>) {
  const root = useRef<HTMLDivElement>(null);
  const id = useUid('seg');
  const move = (dir: number) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length]!;
    onChange(next.value);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-v="${CSS.escape(next.value)}"]`)?.focus());
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') (e.preventDefault(), move(1));
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') (e.preventDefault(), move(-1));
  };
  return (
    <div ref={root} role="radiogroup" aria-label={aria['aria-label']} class={cx('seg', `seg-${size}`, block && 'seg-block', cls)} onKeyDown={onKey} id={id}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          data-v={o.value}
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          title={o.title}
          class="seg-opt"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
