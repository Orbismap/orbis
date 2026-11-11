import { useCallback, useEffect, useRef } from 'preact/hooks';

let uid = 0;
/** Stable unique id for aria relationships. */
export function useUid(prefix = 'o'): string {
  const ref = useRef<string>();
  if (!ref.current) ref.current = `${prefix}-${++uid}`;
  return ref.current;
}

/** Latest-value ref: handlers registered once can read current props. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/** Calls `fn` on Escape while `active`. Uses the capture phase so the innermost popover wins. */
export function useEscape(active: boolean, fn: () => void) {
  const latest = useLatest(fn);
  useEffect(() => {
    if (!active) return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      latest.current();
    };
    document.addEventListener('keydown', on, true);
    return () => document.removeEventListener('keydown', on, true);
  }, [active, latest]);
}

/** Calls `fn` when a pointer goes down outside `ref` while `active`. */
export function useOutside(active: boolean, ref: { current: HTMLElement | null }, fn: () => void) {
  const latest = useLatest(fn);
  useEffect(() => {
    if (!active) return;
    const on = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) latest.current();
    };
    document.addEventListener('pointerdown', on, true);
    return () => document.removeEventListener('pointerdown', on, true);
  }, [active, ref, latest]);
}

/** Stable callback identity with latest closure. */
export function useEvent<A extends unknown[], R>(fn: (...a: A) => R): (...a: A) => R {
  const latest = useLatest(fn);
  return useCallback((...a: A) => latest.current(...a), [latest]);
}

/** True on devices without hover (tooltips are skipped there). */
export const noHover = () => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
