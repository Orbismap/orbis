// Air quality and pollen over Europe (Open-Meteo / Copernicus CAMS): one multi-location request on a coarse grid,
// drawn as a smooth field. Budget: ~340 locations per refresh, cached for 3 h in this browser (localStorage), no refetch
// on pan, zoom or toggling; at most 8 refreshes a day (about 2 700 of the 10 000 free calls per IP and day).
import { effect, signal } from '@preact/signals';
import type { ImageSource } from 'maplibre-gl';
import { formatAge, formatNumber } from '../../core/format';
import { HOUR } from '../../core/time';
import { HttpError, describeError, fetchJson } from '../../data/http';
import { AQ_VARS, airQualityGrid, aqSample, aqUrls, AQ_GRID, type AqGrid, type AqVar } from '../../data/parsers/airquality';
import { AQ_BOUNDS, AQ_SPECS, aqClass, renderAq } from '../../render/gl/airquality';
import { canSpend, pace, spend } from '../../render/ocean/budget';
import { Cleanup, bindOpacity, idBase } from '../../render/common';
import { defineLayer } from '../define';
import type { LegendSpec } from '../types';

const CACHE_KEY = 'orbis:aq-grid:v1';
const TTL = 3 * HOUR;
const AQ_VAR_SET = new Set<string>(AQ_VARS);
const choices = AQ_VARS.map((v) => ({ value: v, label: AQ_SPECS[v].label }));

interface Cached { at: number; grid: Omit<AqGrid, 'vars'> & { vars: Record<string, (number | null)[]> } }
function readCache(): { at: number; grid: AqGrid } | undefined {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Cached | null;
    if (!c || c.grid.nx !== AQ_GRID.nx || c.grid.ny !== AQ_GRID.ny) return undefined;
    const vars = Object.fromEntries(AQ_VARS.map((v) => [v, Float32Array.from(c.grid.vars[v] ?? [], (x) => x ?? NaN)])) as Record<AqVar, Float32Array>;
    return { at: c.at, grid: { ...c.grid, vars } };
  } catch { return undefined; }
}
function writeCache(grid: AqGrid, at: number): void {
  try {
    const vars = Object.fromEntries(AQ_VARS.map((v) => [v, Array.from(grid.vars[v], (x) => (Number.isNaN(x) ? null : Math.round(x * 100) / 100))]));
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at, grid: { ...grid, vars } }));
  } catch { /* quota or private mode: just no cache */ }
}

const legendOf = (v: AqVar): LegendSpec => {
  const spec = AQ_SPECS[v];
  const lo = [0, ...spec.limits];
  return {
    type: 'classes',
    items: spec.classes.map((c, i) => {
      const range = i === spec.limits.length ? `ab ${lo[i]}` : spec.pollen && i === 0 ? '0' : `${lo[i]}–${spec.limits[i]}`;
      return { color: c.color, label: `${c.label} (${range}${spec.unit ? ` ${spec.unit}` : ''})`, shape: 'square' as const };
    }),
  };
};

export default defineLayer({
  id: 'luftqualitaet',
  category: 'wetter',
  title: 'Luftqualität',
  summary: 'Luftqualität und Pollenflug über Europa als Feld, Modellrechnung von Copernicus CAMS',
  icon: 'leaf',
  color: '#50C878',
  form: 'raster',
  cadence: 'hourly',
  coverage: 'Europa',
  sources: [
    {
      name: 'Open-Meteo Air Quality, Copernicus Atmosphere Monitoring Service (CAMS)',
      url: 'https://open-meteo.com/en/docs/air-quality-api',
      license: 'CC BY 4.0; Generated using Copernicus Atmosphere Monitoring Service information 2026, nicht-kommerziell',
    },
  ],
  options: [{ id: 'stoff', label: 'Stoff', type: 'select', default: 'european_aqi', choices }],
  legend: (o) => legendOf((AQ_VAR_SET.has(String(o.stoff)) ? o.stoff : 'european_aqi') as AqVar),
  keywords: ['luftqualität', 'luft', 'feinstaub', 'pm2.5', 'pm10', 'ozon', 'stickstoffdioxid', 'no2', 'pollen', 'birke', 'gräser', 'allergie', 'heuschnupfen', 'cams', 'copernicus', 'aqi'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const base = idBase(ctx);
    const src = `${base}-src`;
    const layer = `${base}-field`;
    const clean = new Cleanup();
    const grid = signal<AqGrid | undefined>(undefined);
    const fetchedAt = signal<number | undefined>(undefined);
    const failure = signal<string | undefined>(undefined);
    const cached = readCache();
    if (cached) { grid.value = cached.grid; fetchedAt.value = cached.at; }

    let running = false;
    const refresh = async () => {
      if (running || ctx.signal.aborted) return;
      const at = fetchedAt.peek();
      if (at && Date.now() - at < TTL) return;
      running = true;
      try {
        const answers: unknown[] = [];
        const urls = aqUrls(100);
        // shared day counter and burst pacing of all keyless Open-Meteo layers (render/ocean/budget.ts)
        if (!canSpend(urls.reduce((n, u) => n + u.locations, 0))) throw new Error('Tagesbudget für Open-Meteo aufgebraucht, morgen wieder');
        const total = urls.reduce((n, u) => n + u.locations, 0);
        await pace(total, ctx.signal); // one reservation for all chunks: 336 < 450 calls/min
        for (const u of urls) {
          spend(u.locations);
          answers.push((await fetchJson<unknown>(u.url, { signal: ctx.signal, timeout: 40_000 })).data);
        }
        const g = airQualityGrid(answers);
        grid.value = g;
        fetchedAt.value = Date.now();
        failure.value = undefined;
        writeCache(g, fetchedAt.value);
      } catch (e) {
        if (ctx.signal.aborted) return;
        failure.value = e instanceof HttpError && e.status === 429 ? 'Tageslimit der kostenlosen Open-Meteo-API erreicht, später wieder' : describeError(e);
      } finally { running = false; }
    };
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 10 * 60_000);
    clean.add(() => clearInterval(timer));

    const varOf = (): AqVar => (AQ_VAR_SET.has(String(ctx.options.value.stoff)) ? ctx.options.value.stoff : 'european_aqi') as AqVar;
    let hasData = false;

    clean.add(effect(() => {
      const g = grid.value;
      const v = varOf();
      if (!g) return;
      const { px, w, h } = renderAq(g, v);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
      const url = c.toDataURL('image/png');
      const b = AQ_BOUNDS(g);
      const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [[b.west, b.north], [b.east, b.north], [b.east, b.south], [b.west, b.south]];
      const existing = ml.getSource(src) as ImageSource | undefined;
      if (existing) existing.updateImage({ url, coordinates });
      else {
        ctx.map.addSource(src, { type: 'image', url, coordinates });
        ctx.map.addLayer({ id: layer, type: 'raster', source: src, paint: { 'raster-opacity': 0.95, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, 'raster');
        clean.add(bindOpacity(ctx, ml, [{ layer, prop: 'raster-opacity', base: 0.95 }]));
      }
      hasData = true;
    }));

    clean.add(effect(() => {
      const g = grid.value;
      const v = varOf();
      const err = failure.value;
      if (!g) { ctx.status(err ? { state: 'error', note: err } : { state: 'loading' }); return; }
      const arr = g.vars[v];
      let max = 0;
      for (const x of arr) if (x > max) max = x;
      const spec = AQ_SPECS[v];
      const off = spec.pollen && max <= 0;
      const note = off ? `${spec.label}: derzeit kein Pollenflug (außerhalb der Saison)` : [err ? `Aktualisierung fehlgeschlagen: ${err}` : undefined, `höchster Wert ${formatNumber(max, max < 10 ? 1 : 0)}${spec.unit ? ` ${spec.unit}` : ''}`].filter(Boolean).join(' · ');
      ctx.status({ state: off ? 'empty' : 'ready', updatedAt: g.time || fetchedAt.value, note });
    }));

    return {
      probe(at) {
        const g = grid.peek();
        if (!g || !hasData) return null;
        const v = varOf();
        const x = aqSample(g, v, at.lng, at.lat);
        if (x === undefined) return null;
        const spec = AQ_SPECS[v];
        const cls = spec.classes[aqClass(spec, x)]!.label;
        return { label: spec.label, value: `${formatNumber(x, x < 10 ? 1 : 0)}${spec.unit ? ` ${spec.unit}` : ''} · ${cls}${g.time ? ` (${formatAge(g.time)})` : ''}` };
      },
      destroy() {
        clean.run();
        ctx.map.remove({ layers: [layer], sources: [src] });
      },
    };
  },
});
