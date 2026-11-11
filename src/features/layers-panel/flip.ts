import { useLayoutEffect, useRef } from 'preact/hooks';
import { reducedMotion } from '../../state/settings';

/** FLIP for keyed list children (`data-key`): animates position changes after every render of the owner. */
export function useFlip(list: { current: HTMLElement | null }) {
  const prev = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const next = new Map<string, number>();
    const rm = reducedMotion();
    for (const child of Array.from(el.children) as HTMLElement[]) {
      const key = child.dataset.key;
      if (!key) continue;
      const top = child.getBoundingClientRect().top;
      next.set(key, top);
      const before = prev.current.get(key);
      if (before !== undefined && !rm && Math.abs(before - top) > 1 && !child.classList.contains('is-dragging'))
        child.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    prev.current = next;
  });
  return prev;
}
