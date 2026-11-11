// fetch with timeout, abort and typed errors.
export type HttpErrorKind = 'timeout' | 'network' | 'http' | 'parse' | 'abort';

export class HttpError extends Error {
  constructor(
    public readonly kind: HttpErrorKind,
    message: string,
    public readonly status?: number,
    public readonly url?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export type RawFormat = 'json' | 'text' | 'arraybuffer';

export interface FetchOptions {
  format?: RawFormat;
  timeout?: number;
  signal?: AbortSignal;
  /** Force revalidation with the server (conditional request via ETag) instead of using a fresh cache entry. */
  revalidate?: boolean;
  headers?: Record<string, string>;
}

export interface FetchResult<T> {
  data: T;
  /** Last-Modified header in ms, when present. */
  lastModified?: number;
  status: number;
}

export const DEFAULT_TIMEOUT = 20_000;

function userMessage(e: HttpError): string {
  switch (e.kind) {
    case 'timeout': return 'Quelle antwortet nicht rechtzeitig';
    case 'network': return 'Quelle nicht erreichbar';
    case 'http': return `Quelle meldet Fehler ${e.status ?? ''}`.trim();
    case 'parse': return 'Daten nicht lesbar';
    case 'abort': return 'Abgebrochen';
  }
}
export const describeError = (e: unknown): string => (e instanceof HttpError ? userMessage(e) : e instanceof Error ? e.message : String(e));

export async function fetchRaw<T = unknown>(url: string, opts: FetchOptions = {}): Promise<FetchResult<T>> {
  const { format = 'json', timeout = DEFAULT_TIMEOUT, signal, revalidate, headers } = opts;
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, timeout);
  const onAbort = () => ctl.abort();
  if (signal) {
    if (signal.aborted) ctl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    let res: Response;
    try {
      res = await fetch(url, { signal: ctl.signal, cache: revalidate ? 'no-cache' : 'default', headers });
    } catch (e) {
      if (timedOut) throw new HttpError('timeout', 'timeout', undefined, url);
      if (signal?.aborted || (e as Error)?.name === 'AbortError') throw new HttpError('abort', 'aborted', undefined, url);
      throw new HttpError('network', (e as Error)?.message ?? 'network', undefined, url);
    }
    if (!res.ok) throw new HttpError('http', `HTTP ${res.status}`, res.status, url);
    const lm = res.headers.get('last-modified');
    const lastModified = lm ? Date.parse(lm) : NaN;
    let data: unknown;
    try {
      data = format === 'json' ? await res.json() : format === 'text' ? await res.text() : await res.arrayBuffer();
    } catch (e) {
      if (timedOut) throw new HttpError('timeout', 'timeout', undefined, url);
      if (signal?.aborted) throw new HttpError('abort', 'aborted', undefined, url);
      throw new HttpError('parse', (e as Error)?.message ?? 'parse', res.status, url);
    }
    return { data: data as T, lastModified: Number.isNaN(lastModified) ? undefined : lastModified, status: res.status };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export const fetchJson = <T = unknown>(url: string, opts: Omit<FetchOptions, 'format'> = {}) => fetchRaw<T>(url, { ...opts, format: 'json' });
