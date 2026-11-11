import type { RefObject } from 'preact';
import { signal } from '@preact/signals';

/** Screen-reader announcement for reorder actions (rendered by LayersList in an aria-live region). */
export const reorderMessage = signal('');

interface DragOptions {
  list: RefObject<HTMLElement>;
  /** Called on drop with the new index. */
  onDrop(id: string, to: number): void;
  /** Lets the FLIP hook animate from where the row was dropped. */
  flipPrev: { current: Map<string, number> };
}

/** Pointer drag for a keyed list: the dragged row follows the pointer, the others make room. */
export function startRowDrag(e: PointerEvent, key: string, o: DragOptions): void {
  const handle = e.currentTarget as HTMLElement;
  const list = o.list.current;
  if (!list || e.button > 0) return;
  const rows = (Array.from(list.children) as HTMLElement[]).filter((r) => r.dataset.key);
  const from = rows.findIndex((r) => r.dataset.key === key);
  if (from < 0 || rows.length < 2) return;
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  const rects = rows.map((r) => r.getBoundingClientRect());
  const startY = e.clientY;
  const dragged = rows[from]!;
  const h = rects[from]!.height;
  dragged.classList.add('is-dragging');
  list.classList.add('is-reordering');
  rows.forEach((r, i) => i !== from && (r.style.transition = 'transform 160ms cubic-bezier(.2,.8,.2,1)'));
  let target = from;
  let raf = 0;
  let lastY = startY;

  const layout = () => {
    const dy = lastY - startY;
    dragged.style.transform = `translateY(${dy}px)`;
    const centre = rects[from]!.top + h / 2 + dy;
    let t = 0;
    rows.forEach((_, i) => i !== from && rects[i]!.top + rects[i]!.height / 2 < centre && t++);
    target = t;
    rows.forEach((r, i) => {
      if (i === from) return;
      let shift = 0;
      if (target > from && i > from && i <= target) shift = -h;
      else if (target < from && i < from && i >= target) shift = h;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  };
  const move = (ev: PointerEvent) => {
    lastY = ev.clientY;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(layout);
  };
  const finish = (commit: boolean) => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', cancel);
    cancelAnimationFrame(raf);
    if (commit && target !== from) {
      // remember visual positions so FLIP animates from where the rows are right now
      rows.forEach((r) => o.flipPrev.current.set(r.dataset.key!, r.getBoundingClientRect().top));
    }
    rows.forEach((r) => {
      r.style.transform = '';
      r.style.transition = '';
    });
    dragged.classList.remove('is-dragging');
    list.classList.remove('is-reordering');
    if (commit && target !== from) o.onDrop(key, target);
  };
  const up = () => finish(true);
  const cancel = () => finish(false);
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', cancel);
  layout();
}
