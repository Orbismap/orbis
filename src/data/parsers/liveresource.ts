// Resource-shaped loader for sources that need custom logic (many requests, progressive results, view bound loading).
// Same contract as data/resource: data/state/error/updatedAt signals, reload, dispose; refreshes only while the tab
// is visible, keeps old data on errors. Not a parser; lives here because layer folders may only contain layers.
import { signal } from '@preact/signals';
import { describeError } from '../http';
import type { Resource } from '../resource';

export interface LiveOptions<T> {
  /** One load. `publish` may be called with partial results while it runs. */
  load(signal: AbortSignal, publish: (partial: T) => void): Promise<T>;
  /** ms between loads, 0: only on `reload()` / `trigger()` */
  every?: number;
}

export interface LiveResource<T> extends Resource<T> {
  /** Load now unless one is running (for view changes); `force` aborts the running one. */
  trigger(force?: boolean): void;
}

export function liveResource<T>(o: LiveOptions<T>): LiveResource<T> {
  const data = signal<T | undefined>(undefined);
  const state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const error = signal<string | undefined>(undefined);
  const updatedAt = signal<number | undefined>(undefined);
  let ctl: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let disposed = false;
  let lastAt = 0;
  const hidden = () => typeof document !== 'undefined' && document.hidden;

  const schedule = () => {
    clearTimeout(timer);
    if (disposed || !o.every) return;
    timer = setTimeout(() => void run(false), o.every);
  };

  async function run(force: boolean) {
    if (disposed) return;
    if (hidden() && !force) { lastAt = 0; return; }
    if (running) {
      if (!force) return;
      ctl?.abort();
    }
    running = true;
    const mine = (ctl = new AbortController());
    if (data.peek() === undefined) state.value = 'loading';
    try {
      const v = await o.load(mine.signal, (p) => { if (!mine.signal.aborted) data.value = p; });
      if (mine.signal.aborted) return;
      data.value = v;
      error.value = undefined;
      state.value = 'ready';
      updatedAt.value = Date.now();
      lastAt = Date.now();
    } catch (e) {
      if (mine.signal.aborted || (e as Error)?.name === 'AbortError') return;
      error.value = describeError(e);
      state.value = data.peek() === undefined ? 'error' : 'ready';
    } finally {
      if (ctl === mine) running = false;
      if (!mine.signal.aborted) schedule();
    }
  }

  const onVisible = () => { if (!hidden() && o.every && Date.now() - lastAt >= o.every) void run(false); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  void run(false);

  return {
    data, state, error, updatedAt,
    reload: () => void run(true),
    trigger: (force = false) => void run(force),
    dispose() {
      disposed = true;
      clearTimeout(timer);
      ctl?.abort();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
