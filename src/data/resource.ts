// The only way layers load data. Reference counted per key, visibility aware, retries with backoff,
// keeps old data when a refresh fails.
import { signal, type ReadonlySignal, type Signal } from '@preact/signals';
import type { ParserName } from './parsers';
import { describeError, fetchRaw, HttpError, type RawFormat } from './http';
import { runParser } from './worker/pool';

export interface ResourceSpec<T> {
  /** Unique; identical keys share one request and one set of signals. */
  key: string;
  url: string | (() => string);
  format?: 'json' | 'text' | 'arraybuffer';
  /** Name of a registered parser (runs in the worker) or a plain function (main thread). */
  parse?: ParserName | ((raw: unknown) => T);
  parseArgs?: unknown;
  /** ms; without: load once. */
  refresh?: number;
  /** ms, default 20 s */
  timeout?: number;
  /** Original source, tried when the mirror fails. */
  fallback?: () => Promise<T>;
}

export interface Resource<T> {
  readonly data: ReadonlySignal<T | undefined>;
  readonly state: ReadonlySignal<'idle' | 'loading' | 'ready' | 'error'>;
  readonly error: ReadonlySignal<string | undefined>;
  /** Last-Modified of the response, otherwise the load time. */
  readonly updatedAt: ReadonlySignal<number | undefined>;
  reload(): void;
  dispose(): void;
}

export const BACKOFF = [2_000, 8_000, 30_000];

interface Shared<T> {
  spec: ResourceSpec<T>;
  users: number;
  data: Signal<T | undefined>;
  state: Signal<'idle' | 'loading' | 'ready' | 'error'>;
  error: Signal<string | undefined>;
  updatedAt: Signal<number | undefined>;
  ctl?: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  failures: number;
  lastLoad: number;
  due: boolean;
}

const registry = new Map<string, Shared<unknown>>();
let visibilityHooked = false;

const hidden = () => typeof document !== 'undefined' && document.hidden;

function hookVisibility() {
  if (visibilityHooked || typeof document === 'undefined') return;
  visibilityHooked = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    for (const s of registry.values()) {
      if (s.due || (s.spec.refresh && Date.now() - s.lastLoad >= s.spec.refresh)) void load(s, false);
    }
  });
}

async function fetchAndParse<T>(s: Shared<T>, signal: AbortSignal, revalidate: boolean): Promise<{ value: T; updated?: number }> {
  const { spec } = s;
  const url = typeof spec.url === 'function' ? spec.url() : spec.url;
  const format: RawFormat = spec.format ?? 'json';
  const named = typeof spec.parse === 'string';
  // worker parsers get raw bytes and decode there, so that JSON.parse of large files stays off the main thread
  const res = await fetchRaw<unknown>(url, { format: named && format !== 'arraybuffer' ? 'arraybuffer' : format, timeout: spec.timeout, signal, revalidate });
  let value: T;
  if (named) value = (await runParser(spec.parse as ParserName, res.data, { format, args: spec.parseArgs, signal })) as T;
  else if (typeof spec.parse === 'function') value = spec.parse(res.data);
  else value = res.data as T;
  return { value, updated: res.lastModified };
}

async function load<T>(s: Shared<T>, force: boolean): Promise<void> {
  if (s.users === 0) return;
  if (hidden() && !force) {
    s.due = true;
    return;
  }
  s.ctl?.abort();
  clearTimeout(s.timer);
  const ctl = (s.ctl = new AbortController());
  s.due = false;
  if (s.data.peek() === undefined) s.state.value = 'loading';
  let ok = false;
  try {
    let result: { value: T; updated?: number } | undefined;
    try {
      result = await fetchAndParse(s, ctl.signal, s.lastLoad > 0);
    } catch (e) {
      if (ctl.signal.aborted) return;
      if (!s.spec.fallback) throw e;
      result = { value: await s.spec.fallback() };
    }
    if (ctl.signal.aborted) return;
    s.data.value = result.value;
    s.updatedAt.value = result.updated ?? Date.now();
    s.error.value = undefined;
    s.state.value = 'ready';
    s.failures = 0;
    s.lastLoad = Date.now();
    ok = true;
  } catch (e) {
    if (ctl.signal.aborted || (e instanceof HttpError && e.kind === 'abort') || (e as Error)?.name === 'AbortError') return;
    s.error.value = describeError(e);
    s.state.value = s.data.peek() === undefined ? 'error' : 'ready';
    s.failures++;
  }
  if (s.users === 0) return;
  if (ok) {
    if (s.spec.refresh) schedule(s, s.spec.refresh);
  } else if (s.spec.refresh || s.failures <= BACKOFF.length) {
    schedule(s, BACKOFF[Math.min(s.failures, BACKOFF.length) - 1]!);
  }
}

function schedule<T>(s: Shared<T>, ms: number) {
  clearTimeout(s.timer);
  s.timer = setTimeout(() => void load(s, false), ms);
}

function acquire<T>(spec: ResourceSpec<T>): Shared<T> {
  hookVisibility();
  let s = registry.get(spec.key) as Shared<T> | undefined;
  if (!s) {
    s = {
      spec,
      users: 0,
      data: signal<T | undefined>(undefined),
      state: signal<'idle' | 'loading' | 'ready' | 'error'>('idle'),
      error: signal<string | undefined>(undefined),
      updatedAt: signal<number | undefined>(undefined),
      failures: 0,
      lastLoad: 0,
      due: false,
    };
    registry.set(spec.key, s as Shared<unknown>);
  }
  s.users++;
  if (s.users === 1) void load(s, false);
  return s;
}

function release<T>(s: Shared<T>) {
  s.users--;
  if (s.users > 0) return;
  s.ctl?.abort();
  clearTimeout(s.timer);
  registry.delete(s.spec.key);
}

export function createResource<T>(spec: ResourceSpec<T>): Resource<T> {
  const s = acquire(spec);
  let disposed = false;
  return {
    data: s.data,
    state: s.state,
    error: s.error,
    updatedAt: s.updatedAt,
    reload() {
      if (!disposed) void load(s, true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      release(s);
    },
  };
}

/** Test hook: number of live shared resources. */
export const _resourceCount = () => registry.size;
