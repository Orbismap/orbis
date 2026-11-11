import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { cx, useLatest } from './hooks';
import { ScrollArea } from './ScrollArea';
import { rubber, settled, snapIndex, stepSpring } from './sheet-physics';
import './sheet.css';

export type Detent = 'peek' | 'half' | 'full';
const ORDER: Detent[] = ['peek', 'half', 'full'];

export interface SheetProps {
  detent: Detent;
  onDetent(d: Detent): void;
  /** Always visible part (the "Blick" row). */
  peek: ComponentChildren;
  /** Height of the peek part in px, without the bottom safe area. */
  peekHeight?: number;
  /** Space kept free above the sheet at the full detent (header), without the top safe area. */
  topInset?: number;
  /** Reports the visible height whenever it changes (every frame while moving). `settled` is true at rest. */
  onVisible?(px: number, settled: boolean): void;
  children?: ComponentChildren;
  label: string;
  reducedMotion?: boolean;
}

/** Measures env(safe-area-inset-*) once and on resize. */
function useSafeArea() {
  const [s, set] = useState({ top: 0, bottom: 0 });
  useLayoutEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(probe);
    const read = () => {
      const cs = getComputedStyle(probe);
      set({ top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 });
    };
    read();
    addEventListener('resize', read);
    return () => (removeEventListener('resize', read), probe.remove());
  }, []);
  return s;
}

function useViewportHeight() {
  const [h, set] = useState(() => window.visualViewport?.height ?? innerHeight);
  useEffect(() => {
    const vv = window.visualViewport;
    const on = () => set(vv?.height ?? innerHeight);
    vv?.addEventListener('resize', on);
    addEventListener('resize', on);
    return () => (vv?.removeEventListener('resize', on), removeEventListener('resize', on));
  }, []);
  return h;
}

/**
 * Bottom sheet with three detents. Follows the finger, snaps by projected velocity, settles with a spring.
 * Below the top detent the content does not scroll; pulling down at the top of a scrolled body hands over to the sheet.
 */
export function Sheet({ detent, onDetent, peek, peekHeight = 120, topInset = 64, onVisible, children, label, reducedMotion }: SheetProps) {
  const safe = useSafeArea();
  const vh = useViewportHeight();
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement | null>(null);

  const peekH = peekHeight + safe.bottom;
  const fullH = Math.max(peekH + 80, vh - topInset - safe.top);
  const halfH = Math.min(fullH - 40, Math.max(peekH + 120, Math.round(vh * 0.5)));
  const points = [peekH, halfH, fullH];
  const targetFor = (d: Detent) => points[ORDER.indexOf(d)]!;

  const cur = useRef({ x: targetFor(detent), v: 0 });
  const anim = useRef(0);
  const dragging = useRef(false);
  const latest = useLatest({ points, detent, onDetent, onVisible, reducedMotion, fullH, peekH });

  const apply = (x: number, isSettled: boolean) => {
    const r = root.current;
    if (!r) return;
    r.style.transform = `translate3d(0, ${latest.current.fullH - x}px, 0)`;
    document.documentElement.style.setProperty('--sheet-h', `${Math.round(x)}px`);
    latest.current.onVisible?.(x, isSettled);
  };

  const animateTo = (target: number, v0 = 0) => {
    cancelAnimationFrame(anim.current);
    if (latest.current.reducedMotion) {
      cur.current = { x: target, v: 0 };
      apply(target, true);
      return;
    }
    cur.current = { x: cur.current.x, v: v0 };
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      cur.current = stepSpring(cur.current, target, dt);
      const done = settled(cur.current, target);
      if (done) cur.current = { x: target, v: 0 };
      apply(cur.current.x, done);
      if (!done) anim.current = requestAnimationFrame(tick);
    };
    anim.current = requestAnimationFrame(tick);
  };

  // follow detent / geometry changes that do not come from a drag
  useLayoutEffect(() => {
    if (dragging.current) return;
    animateTo(targetFor(detent), cur.current.v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detent, peekH, halfH, fullH]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // ---- dragging ----------------------------------------------------------
  const g = useRef({ id: -1, y0: 0, x0: 0, base: 0, lastY: 0, lastT: 0, v: 0, active: false, fromBody: false });

  const begin = (y: number) => {
    cancelAnimationFrame(anim.current);
    dragging.current = true;
    g.current.active = true;
    g.current.base = cur.current.x;
    g.current.y0 = y;
    g.current.lastY = y;
    g.current.lastT = performance.now();
    g.current.v = 0;
    root.current?.classList.add('is-dragging');
  };
  const moveTo = (y: number) => {
    const { points: p } = latest.current;
    const now = performance.now();
    const dt = Math.max(1, now - g.current.lastT);
    const inst = ((g.current.lastY - y) / dt) * 1000; // upward finger = growing sheet
    g.current.v = g.current.v * 0.6 + inst * 0.4;
    g.current.lastY = y;
    g.current.lastT = now;
    const x = rubber(g.current.base + (g.current.y0 - y), p[0]! - 24, p[2]!);
    cur.current = { x, v: g.current.v };
    apply(x, false);
  };
  const end = () => {
    if (!g.current.active) return;
    g.current.active = false;
    dragging.current = false;
    root.current?.classList.remove('is-dragging');
    const { points: p, detent: d } = latest.current;
    const idx = snapIndex(p, cur.current.x, g.current.v, ORDER.indexOf(d));
    const next = ORDER[idx]!;
    animateTo(p[idx]!, g.current.v);
    if (next !== d) latest.current.onDetent(next);
  };

  const onDown = (e: PointerEvent) => {
    if (e.button > 0 || (e.target as HTMLElement).closest('[data-nodrag]')) return;
    g.current.id = e.pointerId;
    g.current.y0 = e.clientY;
    g.current.x0 = e.clientX;
    g.current.fromBody = !!(e.target as HTMLElement).closest('.sheet-body');
    g.current.active = false;
  };
  const onMove = (e: PointerEvent) => {
    const s = g.current;
    if (e.pointerId !== s.id) return;
    if (!s.active) {
      const dy = e.clientY - s.y0;
      if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(e.clientX - s.x0)) return;
      const atFull = latest.current.detent === 'full';
      // at the top detent, only a downward pull from the scroll top (or from the header) takes over
      if (atFull && s.fromBody && (dy < 0 || (body.current?.scrollTop ?? 0) > 0)) {
        s.id = -1;
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      begin(e.clientY); // takeover point is the reference, so the sheet does not jump
    }
    moveTo(e.clientY);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== g.current.id) return;
    g.current.id = -1;
    end();
  };

  // touch pull-down on the scrolled-to-top body of the full sheet (native scrolling would otherwise swallow it)
  useEffect(() => {
    const el = root.current!;
    let y0 = 0;
    let owned = false;
    const start = (e: TouchEvent) => {
      y0 = e.touches[0]!.clientY;
      owned = false;
    };
    const move = (e: TouchEvent) => {
      const b = body.current;
      if (latest.current.detent !== 'full' || !b || !(e.target as HTMLElement).closest('.sheet-body')) return;
      const y = e.touches[0]!.clientY;
      if (!owned && b.scrollTop <= 0 && y - y0 > 8) {
        owned = true;
        begin(y0);
      }
      if (owned) {
        e.preventDefault();
        moveTo(y);
      }
    };
    const stop = () => {
      if (owned) end();
      owned = false;
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
    // handlers read refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cycle = () => latest.current.onDetent(ORDER[(ORDER.indexOf(detent) + 1) % 3]!);

  return (
    <div
      ref={root}
      class={cx('sheet', `sheet-${detent}`)}
      role="region"
      aria-label={label}
      style={{ height: `${fullH}px`, transform: `translate3d(0, ${fullH - cur.current.x}px, 0)`, ['--peek-h' as string]: `${peekH}px` }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <button type="button" class="sheet-grab" aria-label={detent === 'full' ? 'Leiste verkleinern' : 'Leiste vergrößern'} aria-expanded={detent !== 'peek'} onClick={cycle}>
        <span class="sheet-grip" />
      </button>
      <div class="sheet-peek" style={{ height: `${peekHeight - 14 + safe.bottom}px` }}>
        {peek}
      </div>
      <div class="sheet-body-wrap" {...(detent === 'peek' ? ({ inert: '' } as object) : {})}>
        <ScrollArea class="sheet-body" viewportRef={body} locked={detent !== 'full'}>
          {children}
          <div class="sheet-safe" />
        </ScrollArea>
      </div>
    </div>
  );
}
