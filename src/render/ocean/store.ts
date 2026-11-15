// Shared sea-state store: one global 5° lattice of Open-Meteo Marine samples (currents + waves + swell in the same
// calls) plus regional refinements, merged into one OceanGrid. Seegang and Meeresströmung share it, so switching
// between them costs nothing and the keyless API sees one set of requests.
//
// Budget (see budget.ts): the global lattice has ~1 600 ocean points = 1 600 calls per load. It is cached in
// localStorage for 3 h, so a reload costs nothing and a tab left open for a day costs 8 loads at most (12 800 calls
// if nothing else limited it, which is why the daily counter stops refreshes at 8 000 and the old data stays visible).
// Regional blocks are fetched once per region and 6 h, only after the map has been still for 1.5 s.
import { signal, type ReadonlySignal } from '@preact/signals';
import type { Map as MlMap } from 'maplibre-gl';
import { HOUR, MINUTE } from '../../core/time';
import { describeError, fetchJson } from '../../data/http';
import { MARINE_CURRENT_VARS, marineSamples, type MarineSample } from '../../data/parsers/oceangrid';
import { canSpend, pace, spend } from './budget';
import { cacheGet, cachePut } from './cache';
import { buildLattice, oceanPoints, OceanGrid, regionOf, RES } from './grid';
import { isOcean, rasterizeMask, type LandMask } from './landmask';

const API = 'https://marine-api.open-meteo.com/v1/marine';
export const GLOBAL_STEP = 5;
export const GLOBAL_TTL = 3 * HOUR;
export const BLOCK_TTL = 6 * HOUR;
const CHUNK = 150;

interface Tier { id: number; minZoom: number; step: number; block: number; feather: number; maxBlocks: number }
export const TIERS: Tier[] = [
  { id: 1, minZoom: 3.6, step: 1, block: 10, feather: 5, maxBlocks: 4 },
  { id: 2, minZoom: 6.2, step: 0.5, block: 5, feather: 4, maxBlocks: 4 },
];

export interface StoreState {
  state: 'loading' | 'ready' | 'error';
  /** model time of the global lattice, ms */
  modelTime?: number;
  /** when the global lattice was fetched, ms */
  fetchedAt?: number;
  note?: string;
  /** blocks being fetched right now */
  refining: number;
}

type Row = [number, number, ...(number | null)[]];
const pack = (s: MarineSample[]): Row[] => s.map((x) => [+x.lat.toFixed(3), +x.lon.toFixed(3), ...x.v.map((n) => (Number.isFinite(n) ? +n.toFixed(4) : null))] as Row);
const unpack = (rows: Row[]): MarineSample[] => rows.map((r) => ({ lat: r[0], lon: r[1], v: r.slice(2).map((n) => (n === null ? NaN : (n as number))) }));

let maskPromise: Promise<LandMask> | undefined;
/** The ocean mask is an immutable static asset: built once per page. */
export function loadMask(): Promise<LandMask> {
  maskPromise ??= (async () => {
    const base = `${import.meta.env.BASE_URL}data/`;
    const [land, lakes] = await Promise.all([fetchJson(`${base}ne50m_land.json`, { timeout: 40_000 }), fetchJson(`${base}ne50m_lakes.json`, { timeout: 40_000 }).catch(() => undefined)]);
    return rasterizeMask(land.data as never, lakes?.data as never);
  })().catch((e) => { maskPromise = undefined; throw e; });
  return maskPromise;
}

/**
 * Fetches the points in paced chunks. `onPart` gets every chunk as soon as it arrives (the map fills up progressively).
 * A failure after the first chunk returns what was collected with `complete: false`.
 */
async function fetchMarine(points: [number, number][], signal: AbortSignal, onPart?: (s: MarineSample[]) => void): Promise<{ time: number; samples: MarineSample[]; complete: boolean; error?: unknown }> {
  if (!canSpend(points.length)) throw new Error('Tageslimit für Open-Meteo erreicht');
  const samples: MarineSample[] = [];
  let time = NaN;
  for (let i = 0; i < points.length; i += CHUNK) {
    const part = points.slice(i, i + CHUNK);
    try {
      await pace(part.length, signal);
      spend(part.length);
      const url = `${API}?latitude=${part.map((p) => p[0]).join(',')}&longitude=${part.map((p) => p[1]).join(',')}&current=${MARINE_CURRENT_VARS.join(',')}&timezone=GMT`;
      const res = await fetchJson<unknown>(url, { timeout: 40_000, signal });
      const parsed = marineSamples(res.data);
      for (const s of parsed.samples) samples.push(s);
      if (Number.isNaN(time)) time = parsed.time;
      onPart?.(parsed.samples);
    } catch (e) {
      if (!samples.length || signal.aborted) throw e;
      return { time: Number.isFinite(time) ? time : Date.now(), samples, complete: false, error: e };
    }
  }
  return { time: Number.isFinite(time) ? time : Date.now(), samples, complete: true };
}

interface Block { key: string; tier: Tier; lat0: number; lon0: number; samples: MarineSample[]; at: number }

export class OceanStore {
  readonly grid = new OceanGrid();
  readonly mask = signal<LandMask | undefined>(undefined);
  readonly version = signal(0);
  readonly state = signal<StoreState>({ state: 'loading', refining: 0 });
  private global: MarineSample[] = [];
  private readonly blocks = new Map<string, Block>();
  private readonly pending = new Set<string>();
  private readonly ctl = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private viewTimer: ReturnType<typeof setTimeout> | undefined;
  private cooldownUntil = 0;
  private disposed = false;
  private watched = new Map<MlMap, () => void>();

  constructor() {
    void this.init();
  }

  private async init() {
    try {
      this.mask.value = await loadMask();
    } catch (e) {
      this.state.value = { ...this.state.value, state: 'error', note: describeError(e) };
      return;
    }
    await this.loadGlobal();
  }

  private globalPoints(): [number, number][] {
    const m = this.mask.value!;
    const pts = oceanPoints((lon, lat) => isOcean(m, lon, lat), { lat0: -75, lat1: 80, lon0: -180, lon1: 175 }, GLOBAL_STEP);
    // The load takes minutes (paced), the map fills with every chunk. In row order it would fill from the south pole
    // northwards, so the points are shuffled (fixed seed): every chunk spreads over the whole globe and the picture
    // gets denser everywhere at once (gaps are bridged by the interpolation of the lattice).
    let seed = 20240607;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = pts.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [pts[i], pts[j]] = [pts[j]!, pts[i]!];
    }
    return pts;
  }

  private async loadGlobal(force = false) {
    if (this.disposed) return;
    const hit = force ? undefined : cacheGet<{ time: number; rows: Row[] }>('global5', GLOBAL_TTL);
    try {
      let time: number;
      let at: number;
      if (hit) {
        this.global = unpack(hit.d.rows);
        time = hit.d.time;
        at = hit.t;
      } else {
        // an interrupted load (layer switched off, tab closed) continues where it stopped
        const partial = force ? undefined : cacheGet<{ time: number; rows: Row[] }>('global5-part', GLOBAL_TTL);
        const done = partial ? unpack(partial.d.rows) : [];
        // the API snaps coordinates to its own grid, so compare by lattice cell
        const cell = (la: number, lo: number) => `${Math.round(la / GLOBAL_STEP)}:${Math.round(lo / GLOBAL_STEP)}`;
        const have = new Set(done.map((x) => cell(x.lat, x.lon)));
        const todo = this.globalPoints().filter(([la, lo]) => !have.has(cell(la, lo)));
        this.global = [...done];
        if (done.length) { this.rebuild(); this.state.value = { ...this.state.value, state: 'ready', note: 'Raster wird aufgebaut' }; }
        let first = !done.length;
        const r = await fetchMarine(todo, this.ctl.signal, (part) => {
          if (this.disposed) return;
          this.global.push(...part);
          this.rebuild();
          cachePut('global5-part', { time: partial?.d.time ?? Date.now(), rows: pack(this.global) });
          if (first) { first = false; this.state.value = { ...this.state.value, state: 'ready', note: 'Raster wird aufgebaut' }; }
        });
        if (this.disposed) return;
        this.global = [...done, ...r.samples];
        if (!Number.isFinite(r.time) || !r.samples.length) r.time = partial?.d.time ?? r.time;
        r.samples = this.global;
        time = r.time;
        at = Date.now();
        if (!r.complete) {
          this.rebuild();
          this.state.value = { ...this.state.value, state: 'ready', modelTime: time, fetchedAt: at, note: `Unvollständig, ${describeError(r.error)}` };
          this.schedule(10 * MINUTE);
          return;
        }
        cachePut('global5', { time, rows: pack(r.samples) });
      }
      this.rebuild();
      this.state.value = { ...this.state.value, state: 'ready', modelTime: time, fetchedAt: at, note: undefined };
      this.schedule(Math.max(MINUTE, at + GLOBAL_TTL - Date.now()));
    } catch (e) {
      if (this.disposed) return;
      // an expired cache entry is still better than an empty map
      const old = cacheGet<{ time: number; rows: Row[] }>('global5', 7 * 24 * HOUR);
      if (old && !this.global.length) {
        this.global = unpack(old.d.rows);
        this.rebuild();
        this.state.value = { state: 'ready', modelTime: old.d.time, fetchedAt: old.t, note: `Ältere Daten, ${describeError(e)}`, refining: this.state.value.refining };
      } else {
        this.state.value = { ...this.state.value, state: this.global.length ? 'ready' : 'error', note: describeError(e) };
      }
      this.schedule(10 * MINUTE);
    }
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (typeof document !== 'undefined' && document.hidden) {
        // check again when the tab comes back (a hidden tab must not use the quota)
        const on = () => { document.removeEventListener('visibilitychange', on); void this.loadGlobal(true); };
        document.addEventListener('visibilitychange', on);
        return;
      }
      void this.loadGlobal(true);
    }, ms);
  }

  /** Paints global lattice, then the finer blocks in order of resolution. */
  private rebuild() {
    const g = this.grid;
    g.clear();
    g.paint(buildLattice(this.global, { lat0: -75, lat1: 80, lon0: -180, lon1: 175 }, GLOBAL_STEP, true));
    const blocks = [...this.blocks.values()].sort((a, b) => a.tier.id - b.tier.id || a.at - b.at);
    for (const b of blocks) this.paintBlock(b);
    this.version.value = g.version;
  }

  private paintBlock(b: Block) {
    const { step, block, feather } = b.tier;
    const bounds = { lat0: b.lat0 - step, lat1: b.lat0 + block + step, lon0: b.lon0 - step, lon1: b.lon0 + block + step };
    const lat = buildLattice(b.samples, bounds, step);
    const region = regionOf({ lat0: b.lat0, lat1: b.lat0 + block, lon0: b.lon0, lon1: b.lon0 + block });
    this.grid.paint(lat, region, feather);
  }

  // ---- regional refinement ---------------------------------------------------------------------

  /** Blocks of a tier that the view touches, nearest to the centre first. */
  static blocksFor(tier: Tier, b: { west: number; south: number; east: number; north: number }, centre: { lng: number; lat: number }): { lat0: number; lon0: number }[] {
    const out: { lat0: number; lon0: number; d: number }[] = [];
    const west = Math.max(-180, b.west);
    const east = Math.min(179.999, b.east);
    const south = Math.max(-75, b.south);
    const north = Math.min(80, b.north);
    for (let la = Math.floor(south / tier.block) * tier.block; la < north; la += tier.block) {
      for (let lo = Math.floor(west / tier.block) * tier.block; lo < east; lo += tier.block) {
        out.push({ lat0: la, lon0: lo, d: Math.hypot(la + tier.block / 2 - centre.lat, lo + tier.block / 2 - centre.lng) });
      }
    }
    return out.sort((x, y) => x.d - y.d).slice(0, tier.maxBlocks).map(({ lat0, lon0 }) => ({ lat0, lon0 }));
  }

  watchView(map: MlMap): () => void {
    if (this.watched.has(map)) return this.watched.get(map)!;
    const on = () => {
      if (this.viewTimer) clearTimeout(this.viewTimer);
      this.viewTimer = setTimeout(() => this.refineView(map), 1500);
    };
    map.on('moveend', on);
    on();
    const off = () => { map.off('moveend', on); this.watched.delete(map); };
    this.watched.set(map, off);
    return off;
  }

  private refineView(map: MlMap) {
    if (this.disposed || !this.mask.value || !this.global.length || Date.now() < this.cooldownUntil) return;
    const z = map.getZoom();
    const bb = map.getBounds();
    const view = { west: bb.getWest(), south: bb.getSouth(), east: bb.getEast(), north: bb.getNorth() };
    const c = map.getCenter();
    for (const tier of TIERS) {
      if (z < tier.minZoom) continue;
      const maxBlocks = tier.id === 1 && z >= TIERS[1]!.minZoom ? 2 : tier.maxBlocks;
      for (const b of OceanStore.blocksFor({ ...tier, maxBlocks }, view, { lng: c.lng, lat: c.lat })) void this.loadBlock(tier, b.lat0, b.lon0);
    }
  }

  private async loadBlock(tier: Tier, lat0: number, lon0: number) {
    const key = `b${tier.id}:${lat0}:${lon0}`;
    if (this.pending.has(key)) return;
    const have = this.blocks.get(key);
    if (have && Date.now() - have.at < BLOCK_TTL) return;
    this.pending.add(key);
    this.state.value = { ...this.state.value, refining: this.pending.size };
    try {
      const cached = cacheGet<{ rows: Row[] }>(key, BLOCK_TTL);
      let samples: MarineSample[];
      let at: number;
      if (cached) {
        samples = unpack(cached.d.rows);
        at = cached.t;
      } else {
        const m = this.mask.value!;
        const { step, block } = tier;
        const pts = oceanPoints((lon, lat) => isOcean(m, lon, lat), { lat0: lat0 - step, lat1: lat0 + block + step, lon0: lon0 - step, lon1: lon0 + block + step }, step)
          .filter(([la]) => la >= -75 && la <= 80);
        if (!pts.length) { at = Date.now(); samples = []; } else {
          samples = (await fetchMarine(pts, this.ctl.signal)).samples;
          at = Date.now();
        }
        cachePut(key, { rows: pack(samples) });
      }
      if (this.disposed) return;
      this.blocks.set(key, { key, tier, lat0, lon0, samples, at });
      if (samples.length) this.rebuild();
    } catch (e) {
      if (!this.disposed && /429|Limit|limit/.test(String((e as Error).message))) this.cooldownUntil = Date.now() + 10 * MINUTE;
    } finally {
      this.pending.delete(key);
      if (!this.disposed) this.state.value = { ...this.state.value, refining: this.pending.size };
    }
  }

  dispose() {
    this.disposed = true;
    this.ctl.abort();
    if (this.timer) clearTimeout(this.timer);
    if (this.viewTimer) clearTimeout(this.viewTimer);
    for (const off of [...this.watched.values()]) off();
  }
}

const KEEP_ALIVE = 15 * MINUTE;
let shared: { store: OceanStore; refs: number; idle?: ReturnType<typeof setTimeout> } | undefined;
export interface OceanHandle {
  store: OceanStore;
  state: ReadonlySignal<StoreState>;
  release(): void;
}
/** Reference-counted access; the store (timers, requests) goes away with the last layer. */
export function acquireOceanStore(): OceanHandle {
  if (!shared) shared = { store: new OceanStore(), refs: 0 };
  const s = shared;
  if (s.idle) { clearTimeout(s.idle); s.idle = undefined; }
  s.refs++;
  let released = false;
  return {
    store: s.store,
    state: s.store.state,
    release() {
      if (released) return;
      released = true;
      // The store lives on for a while: switching the layer off and on again (or hopping between Seegang and
      // Meeresströmung) must neither abort a running load nor start over.
      if (--s.refs === 0) {
        s.idle = setTimeout(() => {
          if (s.refs > 0) return;
          s.store.dispose();
          if (shared === s) shared = undefined;
        }, KEEP_ALIVE);
      }
    },
  };
}

export { RES };
