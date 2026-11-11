import type { ComponentChildren, JSX } from 'preact';
import { cx } from './hooks';
import './controls.css';

export interface ChipProps extends Omit<JSX.HTMLAttributes<HTMLElement>, 'size'> {
  tone?: 'neutral' | 'limb' | 'now' | 'alert' | 'ok';
  /** Renders a button (toggle chip) when set. */
  pressed?: boolean;
  children: ComponentChildren;
}

/** Small tag or toggle chip. Without `pressed` it is a static tag (coverage, cadence). */
export function Chip({ tone = 'neutral', pressed, class: cls, children, ...rest }: ChipProps) {
  if (pressed !== undefined)
    return (
      <button type="button" class={cx('chip', 'chip-btn', `chip-${tone}`, cls as string)} aria-pressed={pressed} {...(rest as JSX.ButtonHTMLAttributes<HTMLButtonElement>)}>
        {children}
      </button>
    );
  return (
    <span class={cx('chip', `chip-${tone}`, cls as string)} {...rest}>
      {children}
    </span>
  );
}

const KEY_NAMES: Record<string, string> = { mod: '⌘', cmd: '⌘', ctrl: 'Strg', alt: 'Alt', shift: '⇧', esc: 'Esc', enter: '↵', space: 'Leertaste', left: '←', right: '→', up: '↑', down: '↓' };
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Keyboard hint. `keys` like "mod+K" or "Alt+↑"; "mod" renders as ⌘ on Apple devices, Strg elsewhere. */
export function Kbd({ keys }: { keys: string }) {
  const parts = keys.split('+').map((p) => {
    const k = p.toLowerCase();
    if (k === 'mod') return isMac ? '⌘' : 'Strg';
    return KEY_NAMES[k] ?? p;
  });
  return (
    <span class="kbd-group" aria-label={`Tastenkürzel ${parts.join(' ')}`}>
      {parts.map((p, i) => (
        <kbd key={i} class="kbd" aria-hidden="true">
          {p}
        </kbd>
      ))}
    </span>
  );
}

/** Placeholder block for content that is loading (inspector only, per design). */
export function Skeleton({ width = '100%', height = 12, radius = 4 }: { width?: number | string; height?: number; radius?: number }) {
  return <span class="skeleton" style={{ width: typeof width === 'number' ? `${width}px` : width, height: `${height}px`, borderRadius: `${radius}px` }} aria-hidden="true" />;
}
