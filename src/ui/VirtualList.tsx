import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ScrollArea } from './ScrollArea';

export interface VirtualListProps<T> {
  items: readonly T[];
  /** Fixed height or per-index height in px. */
  rowHeight: number | ((item: T, index: number) => number);
  render(item: T, index: number): ComponentChildren;
  itemKey(item: T, index: number): string | number;
  /** Below this many items everything renders (plain list). Design: virtualise above 200. */
  threshold?: number;
  overscan?: number;
  class?: string;
  /** Row index to keep in view (keyboard navigation). */
  scrollToIndex?: number;
  label?: string;
}

/** Windowed list inside a ScrollArea. Rows are absolutely positioned from a prefix sum of heights. */
export function VirtualList<T>({ items, rowHeight, render, itemKey, threshold = 200, overscan = 8, class: cls, scrollToIndex, label }: VirtualListProps<T>) {
  const view = useRef<HTMLDivElement | null>(null);
  const [win, setWin] = useState({ top: 0, h: 600 });
  const offsets = useMemo(() => {
    const o = new Float64Array(items.length + 1);
    for (let i = 0; i < items.length; i++) o[i + 1] = o[i]! + (typeof rowHeight === 'number' ? rowHeight : rowHeight(items[i]!, i));
    return o;
  }, [items, rowHeight]);
  const total = offsets[items.length] ?? 0;
  const virtual = items.length > threshold;

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const measure = () => setWin({ top: v.scrollTop, h: v.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(v);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const v = view.current;
    if (scrollToIndex === undefined || scrollToIndex < 0 || !v) return;
    const top = offsets[scrollToIndex] ?? 0;
    const bottom = offsets[scrollToIndex + 1] ?? top;
    if (top < v.scrollTop) v.scrollTop = top - 8;
    else if (bottom > v.scrollTop + v.clientHeight) v.scrollTop = bottom - v.clientHeight + 8;
  }, [scrollToIndex, offsets]);

  if (!virtual)
    return (
      <ScrollArea class={cls} viewportRef={view} label={label}>
        {items.map((it, i) => (
          <div key={itemKey(it, i)} data-index={i}>
            {render(it, i)}
          </div>
        ))}
      </ScrollArea>
    );

  // binary search for the first visible row
  let lo = 0;
  let hi = items.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1]! <= win.top) lo = mid + 1;
    else hi = mid;
  }
  const first = Math.max(0, lo - overscan);
  let last = lo;
  while (last < items.length - 1 && offsets[last]! < win.top + win.h) last++;
  last = Math.min(items.length - 1, last + overscan);

  const rows = [];
  for (let i = first; i <= last; i++)
    rows.push(
      <div key={itemKey(items[i]!, i)} data-index={i} style={{ position: 'absolute', top: `${offsets[i]}px`, left: 0, right: 0, height: `${offsets[i + 1]! - offsets[i]!}px` }}>
        {render(items[i]!, i)}
      </div>,
    );
  return (
    <ScrollArea class={cls} viewportRef={view} label={label} onScroll={(v) => setWin({ top: v.scrollTop, h: v.clientHeight })}>
      <div style={{ position: 'relative', height: `${total}px` }}>{rows}</div>
    </ScrollArea>
  );
}
