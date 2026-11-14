// Autobahn traffic (Autobahn GmbH des Bundes): jams, closures, roadworks and other reports on German motorways.
// The API has no area query, so all roads are swept (one request per road and service, ETag revalidation makes later
// sweeps cheap); results appear road by road. Direct (CORS "*"), the proxy is the fallback. The data repository does
// not mirror this source (no licence statement).
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { formatDateTime } from '../../core/format';
import { MINUTE } from '../../core/time';
import { proxied } from '../../data/endpoints';
import { fetchRaw } from '../../data/http';
import { AUTOBAHN_KINDS, autobahnItems, type AutobahnKind, type AutobahnProps, type AutobahnService } from '../../data/parsers/autobahn';
import { liveResource } from '../../data/parsers/liveresource';
import { lineLayer } from '../../render/lines';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';
import type { InspectCard } from '../types';

const BASE = 'https://verkehr.autobahn.de/o/autobahn';
const SERVICES: AutobahnService[] = ['warning', 'closure', 'roadworks'];
const KIND_IDS: AutobahnKind[] = ['jam', 'closure', 'roadworks', 'warning'];
type Sweep = { points: Feature<Point, AutobahnProps>[]; lines: Feature<LineString, AutobahnProps>[]; roads: number; done: number };

const get = async <T,>(url: string, signal: AbortSignal, revalidate: boolean): Promise<T> => {
  try {
    return (await fetchRaw<T>(url, { signal, revalidate, timeout: 25_000 })).data;
  } catch (e) {
    if (signal.aborted) throw e;
    return (await fetchRaw<T>(proxied(url), { signal, timeout: 25_000 })).data; // direct request failed: through the proxy
  }
};

async function sweep(signal: AbortSignal, publish: (s: Sweep) => void): Promise<Sweep> {
  const { roads } = await get<{ roads: string[] }>(`${BASE}/`, signal, true);
  const names = [...new Set(roads.map((r) => r.trim()))];
  const jobs = names.flatMap((road) => SERVICES.map((s) => [road, s] as const));
  const seen = new Set<string>();
  const out: Sweep = { points: [], lines: [], roads: jobs.length, done: 0 };
  let flushAt = 0;
  let next = 0;
  let failed = 0;
  const worker = async () => {
    while (next < jobs.length && !signal.aborted) {
      const [road, service] = jobs[next++]!;
      try {
        const raw = await get<unknown>(`${BASE}/${encodeURIComponent(road)}/services/${service}`, signal, true);
        const r = autobahnItems(raw, service, road);
        for (const p of r.points) if (!seen.has(p.properties.id)) { seen.add(p.properties.id); out.points.push(p); }
        for (const l of r.lines) out.lines.push(l);
      } catch {
        if (signal.aborted) return;
        failed++;
      }
      out.done++;
      if (Date.now() > flushAt) { flushAt = Date.now() + 600; publish({ ...out, points: [...out.points], lines: [...out.lines] }); }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  if (failed === jobs.length) throw new Error('Quelle nicht erreichbar');
  return out;
}

const SEV_RADIUS = ['interpolate', ['linear'], ['zoom'], 5, ['match', ['get', 'sev'], 3, 3.5, 2, 3, 2.4], 9, ['match', ['get', 'sev'], 3, 6, 2, 5, 4], 13, ['match', ['get', 'sev'], 3, 10, 2, 9, 7]] as unknown as ExpressionSpecification;
const COLOR = ['match', ['get', 'kind'], 'jam', AUTOBAHN_KINDS.jam.color, 'closure', AUTOBAHN_KINDS.closure.color, 'roadworks', AUTOBAHN_KINDS.roadworks.color, AUTOBAHN_KINDS.warning.color] as unknown as ExpressionSpecification;
const LINE_WIDTH = ['interpolate', ['linear'], ['zoom'], 5, 2.5, 10, 5, 14, 8] as unknown as ExpressionSpecification;

export function autobahnCard(f: AnyFeature): InspectCard {
  const p = f.properties as unknown as AutobahnProps;
  const k = AUTOBAHN_KINDS[p.kind];
  const facts: InspectCard['facts'] = [];
  if (p.dir) facts.push({ label: 'Richtung', value: p.dir });
  if (p.delay >= 0) facts.push({ label: 'Zeitverlust', value: `${p.delay} min`, emphasis: p.delay >= 10 });
  if (p.kmh >= 0) facts.push({ label: 'Ø Geschwindigkeit', value: `${p.kmh} km/h` });
  if (p.km >= 0) facts.push({ label: 'Länge', value: `${p.km.toLocaleString('de-DE')} km` });
  if (p.start) facts.push({ label: p.future ? 'Beginn (geplant)' : 'Seit', value: formatDateTime(p.start) });
  if (p.end) facts.push({ label: 'Ende', value: p.end });
  if (p.blocked) facts.push({ label: 'Status', value: 'gesperrt', emphasis: true });
  return {
    title: `${p.road}: ${p.title || k.label}`, subtitle: k.label, color: k.color, icon: 'car', facts,
    text: p.desc, links: [{ label: 'Verkehrsmeldungen der Autobahn GmbH', url: 'https://www.autobahn.de/verkehrsmeldungen' }],
    location: f.geometry.type === 'Point' ? (f.geometry.coordinates as [number, number]) : undefined,
  };
}

export default defineLayer({
  id: 'autobahn',
  category: 'verkehr',
  title: 'Staus & Baustellen',
  summary: 'Staus, Sperrungen und Baustellen auf deutschen Autobahnen live',
  icon: 'car',
  color: '#ffb020',
  form: 'lines',
  cadence: 'minutes',
  coverage: 'Deutschland',
  sources: [{ name: 'Autobahn GmbH des Bundes – Verkehrsmeldungen', url: 'https://verkehr.autobahn.de/', license: 'Datenlizenz Deutschland (Quelle ohne Spiegel)' }],
  options: [
    { id: 'jam', label: 'Staus', type: 'toggle', default: true },
    { id: 'closure', label: 'Sperrungen', type: 'toggle', default: true },
    { id: 'roadworks', label: 'Baustellen', type: 'toggle', default: true },
    { id: 'warning', label: 'Sonstige Meldungen', type: 'toggle', default: false },
    { id: 'future', label: 'Geplante anzeigen', type: 'toggle', default: false },
  ],
  legend: { type: 'classes', items: KIND_IDS.map((k) => ({ color: AUTOBAHN_KINDS[k].color, label: AUTOBAHN_KINDS[k].label })) },
  keywords: ['autobahn', 'stau', 'baustelle', 'sperrung', 'verkehr', 'a1', 'a3', 'a7', 'traffic jam', 'roadworks', 'verkehrsmeldung'],

  mount(ctx) {
    const res = liveResource<Sweep>({ load: (signal, publish) => sweep(signal, publish), every: 10 * MINUTE });
    const keep = (p: AutobahnProps) => {
      const o = ctx.options.value;
      return o[p.kind] !== false && (o.future === true || !p.future);
    };
    const pts = computed<FeatureCollection | undefined>(() => {
      const d = res.data.value;
      return d ? { type: 'FeatureCollection', features: d.points.filter((f) => keep(f.properties)) } : undefined;
    });
    const lns = computed<FeatureCollection | undefined>(() => {
      const d = res.data.value;
      return d ? { type: 'FeatureCollection', features: d.lines.filter((f) => keep(f.properties)) } : undefined;
    });
    const count = computed(() => pts.value?.features.length);
    const l = lineLayer(ctx, { name: 'lines', data: lns, resources: [res], color: COLOR, width: LINE_WIDTH, casing: true, minZoom: 5, describe: autobahnCard, count });
    const p = pointLayer(ctx, {
      name: 'points', data: pts, resources: [res], color: COLOR, radius: SEV_RADIUS, stroke: { color: '#0b1220', width: 1 },
      sortKey: ['match', ['get', 'kind'], 'closure', 3, 'jam', 2, 'roadworks', 1, 0] as unknown as ExpressionSpecification,
      describe: autobahnCard, count,
      feed: (fs) => fs.filter((f) => (f.properties as unknown as AutobahnProps).kind === 'jam').slice(0, 40).map((f) => {
        const q = f.properties as unknown as AutobahnProps;
        return { id: q.id, title: `${q.road}: ${q.title}`, subtitle: q.delay >= 0 ? `+${q.delay} min` : 'Stau', magnitude: q.delay, color: q.color, location: (f.geometry.type === 'Point' ? f.geometry.coordinates : [0, 0]) as [number, number], time: q.start || undefined };
      }),
    });
    return { destroy: () => { p.destroy(); l.destroy(); res.dispose(); } };
  },
});
