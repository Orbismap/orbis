// Pipelines (gas, oil, hydrogen, water) from OpenStreetMap, queried live from Overpass for the visible area
// from zoom 8 on (there is no bucket extract of ways). Results are cached per 0.5° area while the layer is on.
import { signal } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { fetchRaw, describeError } from '../../data/http';
import { SUBSTANCES, type PipelineCollection, type PipelineProps } from '../../data/parsers/pipelines';
import { runParser } from '../../data/worker/pool';
import { lineLayer } from '../../render/lines';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const MIN_ZOOM = 8;
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const EMPTY: PipelineCollection = { type: 'FeatureCollection', features: [] };

const query = (s: number, w: number, n: number, e: number) =>
  `[out:json][timeout:30];way["man_made"="pipeline"]["substance"~"^(gas|oil|fuel|hydrogen|natural_gas|lpg|crude_oil|petroleum|water)$"](${s},${w},${n},${e});out geom tags 6000;`;

async function fetchArea(s: number, w: number, n: number, e: number, signal: AbortSignal): Promise<PipelineCollection> {
  let last: unknown;
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetchRaw<ArrayBuffer>(`${ep}?data=${encodeURIComponent(query(s, w, n, e))}`, { format: 'arraybuffer', timeout: 45_000, signal });
      return await runParser('overpassPipelines', res.data, { format: 'json', signal });
    } catch (err) {
      if (signal.aborted) throw err;
      last = err;
    }
  }
  throw last;
}

export default defineLayer({
  id: 'pipelines',
  category: 'infrastruktur',
  title: 'Pipelines',
  summary: 'Gas-, Öl-, Wasserstoff- und Wasserleitungen aus OpenStreetMap, ab Zoomstufe 8',
  icon: 'drop',
  color: SUBSTANCES.gas!.color,
  form: 'lines',
  cadence: 'daily',
  coverage: 'Ausschnitt',
  minZoom: MIN_ZOOM,
  sources: [{ name: 'OpenStreetMap-Mitwirkende (Overpass API)', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0' }],
  legend: { type: 'classes', items: Object.values(SUBSTANCES).map((s) => ({ color: s.color, label: s.label, shape: 'line' as const })) },
  keywords: ['pipeline', 'gas', 'öl', 'wasserstoff', 'leitung', 'erdgas', 'nord stream'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const data = signal<PipelineCollection | undefined>(EMPTY);
    const cache = new Map<string, PipelineCollection>();
    let ctl: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = () => {
      if (ctx.signal.aborted || ml.getZoom() < MIN_ZOOM) return;
      const b = ml.getBounds();
      const snap = (v: number, up: boolean) => (up ? Math.ceil(v * 2) / 2 : Math.floor(v * 2) / 2);
      const s = Math.max(-85, snap(b.getSouth(), false)), n = Math.min(85, snap(b.getNorth(), true));
      const w = Math.max(-180, snap(b.getWest(), false)), e = Math.min(180, snap(b.getEast(), true));
      const key = `${s},${w},${n},${e}`;
      const hit = cache.get(key);
      if (hit) { data.value = hit; return; }
      ctl?.abort();
      const my = (ctl = new AbortController());
      ctx.status({ state: 'loading' });
      fetchArea(s, w, n, e, my.signal)
        .then((fc) => {
          if (my.signal.aborted) return;
          cache.set(key, fc);
          data.value = fc;
          ctx.status({ state: fc.features.length ? 'ready' : 'empty', count: fc.features.length, updatedAt: Date.now() });
        })
        .catch((err) => { if (!my.signal.aborted) ctx.status({ state: 'error', note: `OpenStreetMap (Overpass): ${describeError(err)}` }); });
    };
    const onMove = () => { clearTimeout(timer); timer = setTimeout(load, 500); };
    ml.on('moveend', onMove);
    load();

    const handle = lineLayer(ctx, {
      data,
      minZoom: MIN_ZOOM,
      color: ['get', 'color'] as ExpressionSpecification,
      width: ['interpolate', ['linear'], ['zoom'], MIN_ZOOM, 1.4, 12, 2.6, 16, 5] as ExpressionSpecification,
      casing: true,
      opacity: 0.95,
      describe: (f: AnyFeature) => {
        const p = f.properties as PipelineProps;
        const s = SUBSTANCES[p.substance] ?? SUBSTANCES.other!;
        return {
          title: p.name || `${s.label}-Pipeline`,
          subtitle: `${s.label}-Pipeline`,
          color: s.color,
          icon: 'drop',
          facts: [
            { label: 'Medium', value: s.label },
            ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
            ...(p.diameter ? [{ label: 'Durchmesser', value: `${p.diameter} mm` }] : []),
            ...(p.underground ? [{ label: 'Verlegung', value: 'unterirdisch / unter Wasser' }] : []),
          ],
          links: [{ label: 'OpenStreetMap', url: `https://www.openstreetmap.org/way/${p.id}` }],
        };
      },
    });
    return { destroy() { clearTimeout(timer); ctl?.abort(); ml.off('moveend', onMove); handle.destroy(); } };
  },
});
