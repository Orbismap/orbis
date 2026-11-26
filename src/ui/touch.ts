// Shared rules for gestures that move a surface (bottom sheet, action sheet).

/** Touches that start here keep their own gesture and never move the surface around them. */
export const OWN_GESTURE = '[data-nodrag], [role="slider"], .tband, input, select, textarea, .lrow-grip, .is-draggable';

/** True when nothing from `target` up to `root` (both included) is scrolled down. */
export function atTop(target: HTMLElement | null, root: HTMLElement): boolean {
  for (let n = target; n; n = n.parentElement) {
    if (n.scrollTop > 0) return false;
    if (n === root) break;
  }
  return true;
}
