import type { ComponentChildren, JSX } from 'preact';
import { cx } from './hooks';
import './panel.css';

export interface PanelProps extends JSX.HTMLAttributes<HTMLElement> {
  children?: ComponentChildren;
  /** Flat panels have no shadow (for panels that dock into others). */
  flat?: boolean;
  as?: 'section' | 'div' | 'aside' | 'nav' | 'header';
}

/** Glass panel over the map. Opaque where backdrop-filter is unavailable (token fallback). */
export function Panel({ children, class: cls, flat, as: Tag = 'section', ...rest }: PanelProps) {
  const T = Tag as 'section';
  return (
    <T class={cx('panel', flat && 'panel-flat', cls as string)} {...(rest as JSX.HTMLAttributes<HTMLElement>)}>
      {children}
    </T>
  );
}

export function PanelHeader({ title, children, class: cls }: { title?: ComponentChildren; children?: ComponentChildren; class?: string }) {
  return (
    <div class={cx('panel-head', cls)}>
      {title && <h2 class="panel-title">{title}</h2>}
      {children}
    </div>
  );
}
