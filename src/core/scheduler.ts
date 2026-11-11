// Timing helpers. DOM-aware but safe in node (falls back to timers).
export interface Cancelable<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
  flush(): void;
}

/** Leading + trailing throttle: at most one call per `ms`, the last arguments are never lost. */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number): Cancelable<A> {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;
  const run = () => {
    timer = undefined;
    if (!pending) return;
    const a = pending;
    pending = undefined;
    last = Date.now();
    fn(...a);
  };
  const t = ((...args: A) => {
    pending = args;
    const wait = ms - (Date.now() - last);
    if (wait <= 0) {
      if (timer) clearTimeout(timer);
      run();
    } else if (!timer) timer = setTimeout(run, wait);
  }) as Cancelable<A>;
  t.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  };
  t.flush = () => {
    if (timer) clearTimeout(timer);
    run();
  };
  return t;
}

/** Trailing debounce. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Cancelable<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;
  const d = ((...args: A) => {
    pending = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      const a = pending!;
      pending = undefined;
      fn(...a);
    }, ms);
  }) as Cancelable<A>;
  d.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  };
  d.flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = undefined;
    const a = pending;
    pending = undefined;
    if (a) fn(...a);
  };
  return d;
}

export const isHidden = () => typeof document !== 'undefined' && document.hidden;

/** requestAnimationFrame loop; `fn` gets the frame time. `stop()` ends it. Pauses while the tab is hidden (browser default). */
export function rafLoop(fn: (t: number) => void): { stop(): void } {
  let id = 0;
  let stopped = false;
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
  const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : (h: number) => clearTimeout(h);
  const tick = (t: number) => {
    if (stopped) return;
    fn(t);
    id = raf(tick);
  };
  id = raf(tick);
  return {
    stop() {
      stopped = true;
      caf(id);
    },
  };
}

/** Runs `fn` as soon as the tab is visible (immediately when it already is). Returns a cancel function. */
export function whenVisible(fn: () => void): () => void {
  if (!isHidden()) {
    fn();
    return () => {};
  }
  const on = () => {
    if (document.hidden) return;
    document.removeEventListener('visibilitychange', on);
    fn();
  };
  document.addEventListener('visibilitychange', on);
  return () => document.removeEventListener('visibilitychange', on);
}

/** Runs `fn` when the browser is idle (timeout fallback 1.5 s). */
export function idle(fn: () => void, timeout = 1500): () => void {
  if (typeof requestIdleCallback === 'function') {
    const h = requestIdleCallback(fn, { timeout });
    return () => cancelIdleCallback(h);
  }
  const h = setTimeout(fn, 1);
  return () => clearTimeout(h);
}
