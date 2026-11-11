// CPU side of the multi-resolution field data: the 0.5° overview of one or two variables plus a small LRU of 0.125°
// tiles. Decoding runs in the worker pool (data/owx); everything here only keeps and evicts decoded grids.
//
// Memory budget (25 time steps, int16): overview 720×361 → 13 MB per variable, tile 361×361 → 6.5 MB per variable.
// The GPU holds the same bytes again (RG8 texture array). Defaults: 4 tiles → temperature ≈ 2×(13 + 4×6.5) = 78 MB,
// wind (u, v) and humidity (T, Td) ≈ 156 MB across CPU and GPU. Tiles are only requested from zoom 4 on.
// Low-memory devices (phone layout or navigator.deviceMemory <= 4): at most 2 tiles, and a tile's CPU copy is dropped
// right after its GPU upload (`Level.cpuDropped`); probe then reads the 0.5° overview. Wind: (13 + 2×6.5)×2 vars
// ≈ 52 MB GPU + 26 MB overview CPU instead of 156 MB.
import type { OwxField, OwxHeader } from '../../data/owx/decode';
import { loadField, type OwxLatest } from '../../data/owx';
import { isMobile } from '../../state/ui';
import { tileKey, type TileId } from './grid';

export interface Level {
  id: string;
  /** undefined for the overview */
  tile?: TileId;
  /** one decoded grid per variable (same grid) */
  fields: OwxField[];
  header: OwxHeader;
  used: number;
  /** set when the store dropped it; GPU copies must be released */
  disposed: boolean;
  /** CPU grids released after the GPU upload (low-memory devices); not available for probe or re-upload */
  cpuDropped?: boolean;
}

interface TileState {
  id: TileId;
  state: 'loading' | 'ready' | 'error';
  level?: Level;
  ctl?: AbortController;
  retryAt: number;
}

export interface StoreOptions {
  /** Maximum number of 0.125° tiles kept (default 4). */
  maxTiles?: number;
  signal?: AbortSignal;
}

const RETRY_MS = 20_000;

/** Phone layout or little device memory: fewer tiles, no CPU copies of tiles. */
export function lowMemory(): boolean {
  const mem = typeof navigator === 'undefined' ? undefined : (navigator as { deviceMemory?: number }).deviceMemory;
  return isMobile.peek() || (mem !== undefined && mem <= 4);
}
/** Default number of 0.125° tiles kept. */
export const defaultMaxTiles = () => (lowMemory() ? 2 : 4);

/** Releases the CPU grids of a tile once it is on the GPU. */
export function dropCpu(lv: Level): void {
  if (lv.cpuDropped || !lv.tile) return;
  lv.cpuDropped = true;
  for (const f of lv.fields) f.data = new Int16Array(0);
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class FieldStore {
  overview: Level | undefined;
  error: string | undefined;
  private readonly tiles = new Map<string, TileState>();
  /** Maximum number of tiles kept; raised when another user of the same store needs more. */
  maxTiles: number;
  private readonly ctl = new AbortController();
  private onChange: (() => void)[] = [];

  constructor(
    readonly latest: OwxLatest,
    readonly vars: readonly string[],
    opts: StoreOptions = {},
  ) {
    this.maxTiles = opts.maxTiles ?? defaultMaxTiles();
    opts.signal?.addEventListener('abort', () => this.destroy(), { once: true });
    void this.loadOverview();
  }

  subscribe(fn: () => void): () => void {
    this.onChange.push(fn);
    return () => (this.onChange = this.onChange.filter((f) => f !== fn));
  }
  private emit() {
    for (const fn of this.onChange) fn();
  }

  private async loadOverview(): Promise<void> {
    try {
      const fields = await Promise.all(this.vars.map((v) => loadField(this.latest.run, v, 'o', this.ctl.signal)));
      if (this.ctl.signal.aborted) return;
      this.overview = { id: 'o', fields, header: fields[0]!.header, used: now(), disposed: false };
    } catch (e) {
      if (this.ctl.signal.aborted) return;
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.emit();
  }

  /** Loaded tiles, most recently needed first (the shader prefers the earlier ones). */
  readyTiles(): Level[] {
    const out: Level[] = [];
    for (const t of this.tiles.values()) if (t.state === 'ready' && t.level) out.push(t.level);
    return out.sort((a, b) => b.used - a.used);
  }

  hasTile(id: TileId): boolean {
    return this.tiles.get(tileKey(id))?.state === 'ready';
  }

  /**
   * Declares the tiles the viewport needs (nearest first). Missing ones start loading; tiles beyond `maxTiles` that
   * are not wanted are evicted (loading ones aborted). Never blocks: the overview keeps showing meanwhile.
   */
  want(ids: readonly TileId[]): void {
    const t0 = now();
    const wanted = new Set(ids.map(tileKey));
    for (const id of ids) {
      const key = tileKey(id);
      const cur = this.tiles.get(key);
      if (cur?.level) cur.level.used = t0;
      if (cur && (cur.state !== 'error' || t0 < cur.retryAt)) continue;
      this.startTile(id);
    }
    // evict: first everything not wanted beyond the budget (oldest first), aborting loads that nobody needs
    const unwanted = [...this.tiles.entries()].filter(([k]) => !wanted.has(k)).sort((a, b) => (a[1].level?.used ?? 0) - (b[1].level?.used ?? 0));
    let over = this.tiles.size - this.maxTiles;
    for (const [k, t] of unwanted) {
      if (over <= 0 && t.state !== 'loading') break;
      this.drop(k, t);
      over--;
    }
  }

  private drop(key: string, t: TileState) {
    t.ctl?.abort();
    if (t.level) t.level.disposed = true;
    this.tiles.delete(key);
  }

  private startTile(id: TileId): void {
    const key = tileKey(id);
    const ctl = new AbortController();
    const t: TileState = { id, state: 'loading', ctl, retryAt: 0 };
    this.tiles.set(key, t);
    const abort = () => ctl.abort();
    this.ctl.signal.addEventListener('abort', abort, { once: true });
    Promise.all(this.vars.map((v) => loadField(this.latest.run, v, id, ctl.signal)))
      .then((fields) => {
        if (ctl.signal.aborted) return;
        t.level = { id: key, tile: id, fields, header: fields[0]!.header, used: now(), disposed: false };
        t.state = 'ready';
        this.emit();
      })
      .catch(() => {
        if (ctl.signal.aborted) return;
        t.state = 'error';
        t.retryAt = now() + RETRY_MS;
      })
      .finally(() => this.ctl.signal.removeEventListener('abort', abort));
  }

  destroy(): void {
    this.ctl.abort();
    for (const [k, t] of this.tiles) this.drop(k, t);
    if (this.overview) this.overview.disposed = true;
    this.onChange = [];
  }
}

// ---- sharing ---------------------------------------------------------------------------------------
// The wind field and the wind particles of one layer read the same u/v grids: one store per run and variable set,
// reference counted. The decoded data stays in memory only while a user holds the store.
const shared = new Map<string, { store: FieldStore; refs: number }>();

export function acquireStore(latest: OwxLatest, vars: readonly string[], maxTiles: number): { store: FieldStore; release(): void } {
  const key = `${latest.run}|${vars.join(',')}`;
  let e = shared.get(key);
  if (!e) {
    e = { store: new FieldStore(latest, vars, { maxTiles }), refs: 0 };
    shared.set(key, e);
  }
  e.refs++;
  e.store.maxTiles = Math.max(e.store.maxTiles, maxTiles);
  const entry = e;
  let released = false;
  return {
    store: entry.store,
    release() {
      if (released) return;
      released = true;
      if (--entry.refs <= 0) {
        entry.store.destroy();
        if (shared.get(key) === entry) shared.delete(key);
      }
    },
  };
}
