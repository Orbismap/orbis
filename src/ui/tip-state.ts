// One global tooltip: components set `tip`, <TooltipLayer/> renders it. Skipped on touch devices.
import { signal } from '@preact/signals';
import { noHover } from './hooks';

export interface TipState { text: string; shortcut?: string; x: number; y: number; place: 'top' | 'bottom' | 'left' | 'right' }
export const tip = signal<TipState | null>(null);

let timer: ReturnType<typeof setTimeout> | undefined;

export function showTip(el: Element, text: string, shortcut?: string, place: TipState['place'] = 'bottom', delay = 450): void {
  if (noHover()) return;
  clearTimeout(timer);
  const open = () => {
    const r = el.getBoundingClientRect();
    const x = place === 'left' ? r.left : place === 'right' ? r.right : r.left + r.width / 2;
    const y = place === 'top' ? r.top : place === 'bottom' ? r.bottom : r.top + r.height / 2;
    tip.value = { text, shortcut, x, y, place };
  };
  // after the first tip the next ones open instantly (scanning a toolbar)
  if (tip.peek() || delay === 0) open();
  else timer = setTimeout(open, delay);
}

export function hideTip(): void {
  clearTimeout(timer);
  timer = setTimeout(() => (tip.value = null), 60);
}

/** Props to spread on an element to give it a tooltip. */
export function tipProps(text: string | undefined, shortcut?: string, place?: TipState['place']) {
  if (!text) return {};
  return {
    onPointerEnter: (e: PointerEvent) => e.pointerType !== 'touch' && showTip(e.currentTarget as Element, text, shortcut, place),
    onPointerLeave: hideTip,
    onPointerDown: () => {
      clearTimeout(timer);
      tip.value = null;
    },
    onFocus: (e: FocusEvent) => (e.currentTarget as Element).matches(':focus-visible') && showTip(e.currentTarget as Element, text, shortcut, place, 0),
    onBlur: hideTip,
  };
}
