import { effect, signal } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { roundTo, startOfDay } from '../../core/time';
import { goLive, live, now, pause, range, setTime, step, time } from '../../state/time';
import { settings } from '../../state/settings';
import { bandHeight, drawTimeline, readPalette } from './draw';
import { collapsed, rowScale, rows } from './rows';
import { formatSelected } from './math';

const SNAP_NOW_PX = 7;

/** The canvas band: shading, ticks, marks, now line and handle, with scrub / click / wheel / keyboard. */
export function TimeBand({ compact }: { compact?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hover = useMemo(() => signal<{ x: number; y: number } | null>(null), []);
  const wheelAcc = useRef(0);
  const scrub = useRef({ on: false, day: -1 });

  // ---- drawing: redraw only when an input changes, coalesced into one frame ----
  useEffect(() => {
    const cv = canvas.current!;
    const g = cv.getContext('2d')!;
    let raf = 0;
    let size = { w: 0, h: 0, dpr: 0 };
    const measure = () => {
      const r = cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (r.width !== size.w || r.height !== size.h || dpr !== size.dpr) {
        size = { w: r.width, h: r.height, dpr };
        cv.width = Math.round(r.width * dpr);
        cv.height = Math.round(r.height * dpr);
      }
    };
    const paint = () => {
      raf = 0;
      measure();
      if (!size.w) return;
      g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      const r = range.peek();
      drawTimeline(
        g,
        { w: size.w, h: size.h, start: r.start, end: r.end, frames: r.frames, now: now.peek(), time: time.peek(), live: live.peek(), rows: rows.peek(), collapsed: collapsed.peek(), scale: rowScale.peek(), hover: hover.peek(), compact: !!compact },
        readPalette(cv),
      );
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const stop = effect(() => {
      range.value;
      now.value;
      time.value;
      live.value;
      rows.value;
      collapsed.value;
      rowScale.value;
      hover.value;
      settings.value.theme;
      schedule();
    });
    const ro = new ResizeObserver(schedule);
    ro.observe(cv);
    const mq = matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', schedule);
    void document.fonts?.ready.then(schedule);
    return () => {
      stop();
      ro.disconnect();
      mq.removeEventListener('change', schedule);
      cancelAnimationFrame(raf);
    };
  }, [compact]);

  // ---- interaction ----
  const tFromX = (clientX: number) => {
    const r = canvas.current!.getBoundingClientRect();
    const v = range.peek();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return { t: v.start + f * (v.end - v.start), px: clientX - r.left, width: r.width };
  };
  const apply = (clientX: number) => {
    const rg = range.peek();
    const v = rg;
    const { t, px, width } = tFromX(clientX);
    const nowPx = ((now.peek() - v.start) / (v.end - v.start)) * width;
    if (Math.abs(px - nowPx) < SNAP_NOW_PX) goLive();
    else {
      let snapped = t;
      if (rg.frames?.length) snapped = rg.frames.reduce((best, f) => (Math.abs(f - t) < Math.abs(best - t) ? f : best), rg.frames[0]!);
      else snapped = roundTo(t, rg.step);
      setTime(snapped);
    }
    // haptic tick on day boundaries while scrubbing
    const day = startOfDay(time.peek());
    if (scrub.current.day !== -1 && day !== scrub.current.day) navigator.vibrate?.(6);
    scrub.current.day = day;
  };
  const down = (e: PointerEvent) => {
    if (e.button > 0) return;
    pause();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    wrap.current?.focus({ preventScroll: true });
    scrub.current = { on: true, day: startOfDay(time.peek()) };
    apply(e.clientX);
  };
  const move = (e: PointerEvent) => {
    if (scrub.current.on) apply(e.clientX);
    if (e.pointerType === 'mouse') {
      const r = canvas.current!.getBoundingClientRect();
      hover.value = { x: e.clientX - r.left, y: e.clientY - r.top };
    }
  };
  const up = () => {
    scrub.current = { on: false, day: -1 };
  };
  const key = (e: KeyboardEvent) => {
    const rg = range.peek();
    const big = e.shiftKey ? 6 : 1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      for (let i = 0; i < big; i++) step(dir);
    } else if (e.key === 'Home') (e.preventDefault(), setTime(rg.start));
    else if (e.key === 'End') (e.preventDefault(), setTime(rg.end));
  };
  useEffect(() => {
    const el = wrap.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      pause();
      wheelAcc.current += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      while (Math.abs(wheelAcc.current) >= 40) {
        step(wheelAcc.current > 0 ? 1 : -1);
        wheelAcc.current -= Math.sign(wheelAcc.current) * 40;
      }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const rg = range.value;
  const t = time.value;
  const height = bandHeight(rows.value, rg.start, rg.end, collapsed.value, rowScale.value, !!compact);
  return (
    <div
      ref={wrap}
      class={compact ? 'tband tband-compact' : 'tband'}
      role="slider"
      tabIndex={0}
      aria-label="Zeit"
      aria-valuemin={rg.start}
      aria-valuemax={rg.end}
      aria-valuenow={t}
      aria-valuetext={live.value ? `Jetzt, ${formatSelected(t, rg.step)}` : formatSelected(t, rg.step)}
      aria-orientation="horizontal"
      data-nodrag
      style={compact ? undefined : { height: `${height}px` }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={() => (hover.value = null)}
      onKeyDown={key}
    >
      <canvas ref={canvas} />
    </div>
  );
}
