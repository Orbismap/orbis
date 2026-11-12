// Shared view of v1/latest.json for all weather layers: one request, a signal for the time range, and the TimeSpec
// of the forecast layers. Light module (no GL), so layer files can import it statically.
import { signal } from '@preact/signals';
import { HOUR } from '../../core/time';
import { loadLatest, type OwxLatest } from '../../data/owx';
import type { SourceRef, TimeSpec } from '../../layers/types';
import { runNote } from './grid';

export const latest = signal<OwxLatest | undefined>(undefined);
let inflight: Promise<OwxLatest> | undefined;

/** Loads latest.json once (re-used by all layers; a failed attempt may be repeated). */
export function ensureLatest(signal?: AbortSignal): Promise<OwxLatest> {
  if (latest.peek()) return Promise.resolve(latest.peek()!);
  inflight ??= loadLatest(signal)
    .then((l) => (latest.value = l))
    .finally(() => (inflight = undefined));
  return inflight;
}

const REFRESH_MS = 10 * 60_000;
let watchers = 0;
let timer: ReturnType<typeof setInterval> | undefined;

async function refreshLatest(): Promise<void> {
  if (typeof document !== 'undefined' && document.hidden) return;
  try {
    const l = await loadLatest();
    if (l.run !== latest.peek()?.run) latest.value = l; // a new model run: users switch over when their data is loaded
  } catch { /* keep the current run */ }
}

/**
 * Calls `use(latest)` for the current model run and again whenever latest.json (re-checked every 10 min while
 * the tab is visible) announces a new run. The previous run stays in use until `use` has switched.
 * Returns the stop function.
 */
export function followLatest(signal: AbortSignal, use: (l: OwxLatest) => void, onError: (e: unknown) => void): () => void {
  let stopped = false;
  let last: string | undefined;
  const fire = (l: OwxLatest) => {
    if (stopped || signal.aborted || l.run === last) return;
    last = l.run;
    use(l);
  };
  ensureLatest().then(fire, (e) => { if (!stopped) onError(e); });
  const un = latest.subscribe((l) => l && fire(l));
  if (watchers++ === 0) {
    timer = setInterval(() => void refreshLatest(), REFRESH_MS);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  }
  return () => {
    if (stopped) return;
    stopped = true;
    un();
    if (--watchers === 0) {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    }
  };
}

/** Back in the tab: check right away if the last check is overdue. */
let lastVisibleCheck = Date.now();
function onVisible(): void {
  if (document.hidden || Date.now() - lastVisibleCheck < REFRESH_MS) return;
  lastVisibleCheck = Date.now();
  void refreshLatest();
}

export const attributionOf = (l: OwxLatest | undefined) => l?.attribution ?? 'Deutscher Wetterdienst (DWD), ICON, CC BY 4.0 – verändert (Gitter, Einheiten, Quantisierung)';
export const noteOf = (l: OwxLatest) => runNote(l.issued);

/** Time range of the model run relative to now. Reads the `latest` signal, so the timeline follows once it loaded. */
export const forecastTime: TimeSpec = {
  mode: 'frames',
  range() {
    const l = latest.value;
    if (!l) {
      void ensureLatest().catch(() => {});
      return { start: -3 * HOUR, end: 72 * HOUR, step: HOUR };
    }
    const now = Date.now();
    const first = l.times[0]!;
    const last = l.times[l.times.length - 1]!;
    // hourly stepping: the shader interpolates between the 3-hourly model steps
    return { start: first - now, end: last - now, step: HOUR };
  },
};

/** Source reference shared by all model layers (attribution text comes from latest.json when loaded). */
export const ICON_SOURCE: SourceRef = {
  name: 'Deutscher Wetterdienst, ICON global',
  url: 'https://opendata.dwd.de/weather/nwp/icon/',
  license: 'CC BY 4.0, verändert (Gitter, Einheiten, Quantisierung)',
};

/** Terrain heights for the terrain correction of temperature and dew point (tiles load when zoomed in). */
export const DEM_SOURCE: SourceRef = {
  name: 'Mapterhorn (Geländehöhen)',
  url: 'https://mapterhorn.com/attribution',
  license: '© Mapterhorn und Quellen, siehe Namensnennung',
};
