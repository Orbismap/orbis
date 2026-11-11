import type { ComponentChildren, Ref } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { cx } from './hooks';
import './scroll.css';

export interface ScrollAreaProps {
  children?: ComponentChildren;
  class?: string;
  /** Receives the scroll element (for virtual lists, scroll-into-view). */
  viewportRef?: Ref<HTMLDivElement>;
  onScroll?(el: HTMLDivElement): void;
  /** Disable user scrolling (the Sheet does this below its top detent). */
  locked?: boolean;
  label?: string;
}

/** Scroll container with soft fade edges that appear only when there is more content in that direction. */
export function ScrollArea({ children, class: cls, viewportRef, onScroll, locked, label }: ScrollAreaProps) {
  const el = useRef<HTMLDivElement | null>(null);
  const raf = useRef(0);
  const update = () => {
    const v = el.current;
    if (!v) return;
    v.dataset.top = String(v.scrollTop > 2);
    v.dataset.bottom = String(v.scrollTop + v.clientHeight < v.scrollHeight - 2);
  };
  useEffect(() => {
    update();
    const v = el.current!;
    const ro = new ResizeObserver(update);
    ro.observe(v);
    const mo = new MutationObserver(update);
    mo.observe(v, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, []);
  return (
    <div
      class={cx('scroll', locked && 'is-locked', cls)}
      ref={(n) => {
        el.current = n;
        if (typeof viewportRef === 'function') viewportRef(n);
        else if (viewportRef) (viewportRef as { current: HTMLDivElement | null }).current = n;
      }}
      aria-label={label}
      onScroll={(e) => {
        cancelAnimationFrame(raf.current);
        raf.current = requestAnimationFrame(update);
        onScroll?.(e.currentTarget as HTMLDivElement);
      }}
    >
      {children}
    </div>
  );
}
