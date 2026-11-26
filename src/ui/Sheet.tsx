import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { cx, useLatest } from './hooks';
import { ScrollArea } from './ScrollArea';
import { claimsGesture, keyboardInset, rubber, settled, snapIndex, stepSpring } from './sheet-physics';
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
  /** Identifies the content: another key starts at the top, unless `keepScroll` asks for the position it had before. */
  scrollKey?: string;
  keepScroll?: boolean;
  /** The content brings its own scrolling list and fills the body. */
  fill?: boolean;
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
  // visual viewport shrinks with the on-screen keyboard but also grows/shrinks with pinch zoom: scale it back
  const read = () => {
    const vv = window.visualViewport;
    return Math.round(vv ? Math.min(innerHeight, vv.height * vv.scale) : innerHeight);
  };
  const [h, set] = useState(read);
  useEffect(() => {
    const vv = window.visualViewport;
    const on = () => set(read());
    vv?.addEventListener('resize', on);
    addEventListener('resize', on);
    addEventListener('orientationchange', on);
    return () => (vv?.removeEventListener('resize', on), removeEventListener('resize', on), removeEventListener('orientationchange', on));
  }, []);
  return h;
}

/** Keyboard height at the bottom edge; also published as `--kb-inset` for dialogs outside the sheet. */
function useKeyboardInset() {
  const [inset, set] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement.style;
    const on = () => {
      const px = keyboardInset(innerHeight, vv);
      root.setProperty('--kb-inset', `${px}px`);
      set(px);
    };
    on();
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => (vv.removeEventListener('resize', on), vv.removeEventListener('scroll', on), root.removeProperty('--kb-inset'));
  }, []);
  return inset;
}

/** Touches that start here keep their own gesture and never move the sheet. */
const OWN_GESTURE = '[data-nodrag], [role="slider"], .tband, input, select, textarea, .lrow-grip, .is-draggable';

/**
 * Bottom sheet with three detents. Follows the finger, snaps by projected velocity, settles with a spring.
 * The body's viewport is exactly the visible part. A touch on it moves the sheet or scrolls the content, see
 * `claimsGesture`. The grip and peek row always drag the sheet.
 */
export function Sheet({ detent, onDetent, peek, peekHeight = 120, topInset = 64, onVisible, children, label, reducedMotion, scrollKey = '', keepScroll, fill }: SheetProps) {
  const safe = useSafeArea();
  const vh = useViewportHeight();
  const keyboard = useKeyboardInset();
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
  useEffect(
    () => () => {
      cancelAnimationFrame(anim.current);
      document.documentElement.style.removeProperty('--sheet-h');
    },
    [],
  );

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
    const v = performance.now() - g.current.lastT > 100 ? 0 : g.current.v; // held still before letting go: no flick
    const idx = snapIndex(p, cur.current.x, v, ORDER.indexOf(d));
    const next = ORDER[idx]!;
    animateTo(p[idx]!, v);
    if (next !== d) latest.current.onDetent(next);
  };

  const onDown = (e: PointerEvent) => {
    if (e.button > 0 || (e.target as HTMLElement).closest(OWN_GESTURE)) return;
    g.current.id = e.pointerId;
    g.current.y0 = e.clientY;
    g.current.x0 = e.clientX;
    // touch on the body is native scrolling plus the pull-down hand-over below; only grip and peek drag via pointer events
    g.current.fromBody = latest.current.detent !== 'peek' && !!(e.target as HTMLElement).closest('.sheet-body-wrap');
    g.current.active = false;
    if (g.current.fromBody) g.current.id = -1;
  };
  const onMove = (e: PointerEvent) => {
    const s = g.current;
    if (e.pointerId !== s.id) return;
    if (!s.active) {
      const dy = e.clientY - s.y0;
      if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(e.clientX - s.x0)) return;
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

  // touch on the body: the first movement decides between moving the sheet and native scrolling
  useEffect(() => {
    const el = root.current!;
    let x0 = 0;
    let y0 = 0;
    let mode: 'undecided' | 'sheet' | 'native' = 'native';
    const atTop = (t: HTMLElement | null) => {
      for (let n = t; n && n !== el; n = n.parentElement) if (n.scrollTop > 0) return false;
      return true;
    };
    const start = (e: TouchEvent) => {
      const t = e.target as HTMLElement;
      x0 = e.touches[0]!.clientX;
      y0 = e.touches[0]!.clientY;
      mode = e.touches.length === 1 && t.closest('.sheet-body') && !t.closest(OWN_GESTURE) ? 'undecided' : 'native';
    };
    const move = (e: TouchEvent) => {
      if (mode === 'native') return;
      const x = e.touches[0]!.clientX;
      const y = e.touches[0]!.clientY;
      if (mode === 'undecided') {
        if (x === x0 && y === y0) return;
        mode = e.cancelable && claimsGesture(latest.current.detent, x - x0, y - y0, atTop(e.target as HTMLElement)) ? 'sheet' : 'native';
        if (mode === 'native') return;
      }
      if (e.cancelable) e.preventDefault();
      // a few px of slack, so that a tap with a shaky finger stays a tap; the takeover point is the reference, no jump
      if (!g.current.active && Math.abs(y - y0) > 6) begin(y);
      if (g.current.active) moveTo(y);
    };
    const stop = () => {
      if (mode === 'sheet') end();
      mode = 'native';
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

  // every content has its own scroll position
  const scrolled = useRef(new Map<string, number>());
  const keyRef = useRef(scrollKey);
  useLayoutEffect(() => {
    keyRef.current = scrollKey;
    const top = keepScroll ? scrolled.current.get(scrollKey) ?? 0 : 0;
    const place = () => body.current && (body.current.scrollTop = top);
    place();
    const frame = requestAnimationFrame(place); // nested components may render the new content after this effect
    return () => cancelAnimationFrame(frame);
  }, [scrollKey]);

  const cycle = () => latest.current.onDetent(ORDER[(ORDER.indexOf(detent) + 1) % 3]!);

  return (
    <div
      ref={root}
      class={cx('sheet', `is-${detent}`)}
      role="region"
      aria-label={label}
      style={{ height: `${fullH}px`, bottom: `${keyboard}px`, transform: `translate3d(0, ${fullH - cur.current.x}px, 0)`, ['--peek-h' as string]: `${peekH}px` }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <button type="button" class="sheet-grab" aria-label={detent === 'full' ? 'Leiste verkleinern' : 'Leiste vergrößern'} aria-expanded={detent !== 'peek'} onClick={cycle}>
        <span class="sheet-grip" />
      </button>
      <div class="sheet-peek" style={{ height: `${peekHeight - 20}px` }}>
        {peek}
      </div>
      <div
        class="sheet-body-wrap"
        style={{ paddingBottom: `${Math.max(0, fullH - targetFor(detent))}px` }}
        {...(detent === 'peek' ? ({ inert: '' } as object) : {})}
        // typing needs room above the keyboard
        onFocusIn={(e: FocusEvent) => (e.target as HTMLElement).matches('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea') && latest.current.onDetent('full')}
      >
        <ScrollArea class={cx('sheet-body', fill && 'is-fill')} viewportRef={body} locked={detent === 'peek'} onScroll={(el) => scrolled.current.set(keyRef.current, el.scrollTop)}>
          {children}
          <div class="sheet-safe" />
        </ScrollArea>
      </div>
    </div>
  );
}
