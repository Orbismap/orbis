import type { JSX } from 'preact';
import { ICON_PATHS, type UiIconName } from './paths';

export interface IconProps extends Omit<JSX.SVGAttributes<SVGSVGElement>, 'name' | 'size'> {
  name: UiIconName;
  /** Rendered size in px; the drawing grid stays 20. */
  size?: number;
}

/** One icon of the Orbis set. Decorative by default (aria-hidden); pass `title` to expose it. */
export function Icon({ name, size = 20, title, class: cls, ...rest }: IconProps & { title?: string }) {
  const d = ICON_PATHS[name] ?? ICON_PATHS.info;
  return (
    <svg
      class={cls ? `icon ${cls}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      aria-label={title}
      focusable="false"
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}
