import { computed, effect, signal } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { roundTo, startOfDay } from '../../core/time';
import { getLayer } from '../../layers/registry';
import { feeds } from '../../state/session';
import { goLive, live, now, pause, range, setTime, step, time } from '../../state/time';
import { camera } from '../../state/view';
import { settings } from '../../state/settings';
import { drawTimeline, readPalette, type Mark } from './draw';
import { formatSelected } from './math';

/** Centre of the map quantised to 2°: the day/night shading only redraws when it visibly changes. */
const centreKey = computed(() => {
  const c = camera.value;
  return `${Math.round(c.lng / 2) * 2}:${Math.round(c.lat / 2) * 2}`;
});

const marks = computed<Mark[]>(() => {
  const out: Mark[] = [];
  for (const [id, items] of Object.entries(feeds.value)) {
    const color = getLayer(id)?.color ?? '#72C8F0';
    for (const it of items) if (it.time !== undefined) out.push({ t: it.time, color: it.color ?? color });
  }
  return out.sort((a, b) => a.t - b.t);
});

const SNAP_NOW_PX = 7;

/** The canvas band: shading, ticks, marks, now line and handle, with scrub / click / wheel / keyboard. */
export function TimeBand({ compact }: { compact?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hover = useMemo(() => signal<number | null>(null), []);
  const scrub = useRef({ on: false, day: -1 });
  const wheelAcc = useRef(0);

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
      const [lng, lat] = centreKey.peek().split(':').map(Number) as [number, number];
      drawTimeline(
        g,
        { w: size.w, h: size.h, start: r.start, end: r.end, frames: r.frames, now: now.peek(), time: time.peek(), live: live.peek(), centre: { lng, lat }, marks: marks.peek(), hoverX: hover.peek(), compact: !!compact },
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
      marks.value;
      centreKey.value;
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
    const rg = range.peek();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return { t: rg.start + f * (rg.end - rg.start), px: clientX - r.left, width: r.width };
  };
  const apply = (clientX: number) => {
    const rg = range.peek();
    const { t, px, width } = tFromX(clientX);
    const nowPx = ((now.peek() - rg.start) / (rg.end - rg.start)) * width;
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
    scrub.current = { on: true, day: startOfDay(time.peek()) };
    wrap.current?.focus({ preventScroll: true });
    apply(e.clientX);
  };
  const move = (e: PointerEvent) => {
    if (scrub.current.on) apply(e.clientX);
    else if (e.pointerType === 'mouse') hover.value = tFromX(e.clientX).px;
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
      aria-valuetext={live.value ? `Jetzt, ${formatSelected(t)}` : formatSelected(t)}
      aria-orientation="horizontal"
      data-nodrag
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
