// Map padding from the open panels / sheet, animated so the map eases instead of jumping.
import { effect, signal } from '@preact/signals';
import { inspector, probe } from '../state/selection';
import { reducedMotion } from '../state/settings';
import { isMobile, leftPanelOpen } from '../state/ui';
import { padding, setPadding, type Padding } from '../state/view';

/** Visible height of the mobile sheet and of the desktop bottom dock (px), written by their components. */
export const sheetPx = signal(0);
export const dockPx = signal(90);
let raf = 0;

function animateTo(target: Padding): void {
  cancelAnimationFrame(raf);
  const from = padding.peek();
  const same = (['top', 'right', 'bottom', 'left'] as const).every((k) => Math.abs(from[k] - target[k]) < 0.5);
  if (same) return;
  if (reducedMotion()) return setPadding(target);
  const t0 = performance.now();
  const D = 240;
  const tick = (now: number) => {
    const f = Math.min(1, Math.max(0, (now - t0) / D));
    const e = 1 - Math.pow(1 - f, 3);
    setPadding({
      top: from.top + (target.top - from.top) * e,
      right: from.right + (target.right - from.right) * e,
      bottom: from.bottom + (target.bottom - from.bottom) * e,
      left: from.left + (target.left - from.left) * e,
    });
    if (f < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

/** Keeps `state/view.padding` in line with what covers the map. `sheet` is the visible mobile sheet height. */
export function startPadding(): () => void {
  const stop = effect(() => {
    const mobile = isMobile.value;
    const left = leftPanelOpen.value;
    const selected = !!(inspector.value || probe.value);
    if (mobile) {
      animateTo({ top: 64, right: 0, bottom: Math.max(0, sheetPx.value), left: 0 });
    } else {
      animateTo({ top: 0, right: selected ? 360 + 64 + 24 : 64, bottom: dockPx.value + 40, left: left ? 360 : 0 });
    }
  });
  return () => {
    stop();
    cancelAnimationFrame(raf);
  };
}
