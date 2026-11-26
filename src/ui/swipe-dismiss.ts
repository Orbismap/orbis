import { useEffect } from 'preact/hooks';
import { useLatest } from './hooks';
import { dismisses } from './sheet-physics';
import { atTop, OWN_GESTURE } from './touch';

/** Pulling a panel down from the top of its content moves it along; far or fast enough closes it. */
export function useSwipeDown(ref: { current: HTMLElement | null }, active: boolean, onClose: () => void) {
  const latest = useLatest(onClose);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    let mode: 'undecided' | 'drag' | 'native' = 'native';
    let x0 = 0;
    let y0 = 0;
    let y = 0;
    let t = 0;
    let v = 0;
    const start = (e: TouchEvent) => {
      x0 = e.touches[0]!.clientX;
      y = y0 = e.touches[0]!.clientY;
      t = e.timeStamp;
      v = 0;
      mode = e.touches.length === 1 && !(e.target as HTMLElement).closest(OWN_GESTURE) ? 'undecided' : 'native';
    };
    const move = (e: TouchEvent) => {
      if (mode === 'native') return;
      const x = e.touches[0]!.clientX;
      const next = e.touches[0]!.clientY;
      if (mode === 'undecided') {
        if (x === x0 && next === y0) return;
        const down = next - y0 > 0 && next - y0 >= Math.abs(x - x0);
        mode = down && e.cancelable && atTop(e.target as HTMLElement, el) ? 'drag' : 'native';
        if (mode === 'native') return;
        el.style.transition = 'none';
      }
      if (e.cancelable) e.preventDefault();
      v = ((next - y) / Math.max(1, e.timeStamp - t)) * 1000;
      y = next;
      t = e.timeStamp;
      el.style.transform = `translateY(${Math.max(0, y - y0)}px)`;
    };
    const stop = (e: TouchEvent) => {
      if (mode !== 'drag') return;
      mode = 'native';
      if (dismisses(y - y0, e.timeStamp - t > 100 ? 0 : v)) return latest.current();
      el.style.transition = 'transform 0.2s ease';
      el.style.transform = '';
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', stop);
    el.addEventListener('touchcancel', stop);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', stop);
      el.removeEventListener('touchcancel', stop);
    };
  }, [active]);
}
