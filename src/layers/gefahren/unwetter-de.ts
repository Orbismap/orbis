// Warnings for Germany in one layer: DWD weather warnings (WFS, district level, official colours) and the NINA/BBK
// civil-protection warnings (MoWaS, KATWARN, BIWAPP, flood portal, police) via warnung.bund.de, coloured by severity.
// Option "Quelle" picks all / weather only / civil protection only. If the DWD WFS is unreachable the WMS image of the
// same warnings stands in (not clickable). The id stays `unwetter-de` so that saved Karten keep working.
import { computed, effect, signal } from '@preact/signals';
import { formatAge, formatDateTime, formatInt } from '../../core/format';
import { MINUTE } from '../../core/time';
import { proxied } from '../../data/endpoints';
import { fetchJson } from '../../data/http';
import { dwdWarnings, type DwdCollection, type DwdProps } from '../../data/parsers/dwd';
import { NINA_SEVERITY, NINA_SOURCES, ninaDetail, ninaFeatures, ninaGeometry, type NinaDetail, type NinaGeometry, type NinaListItem, type NinaProps } from '../../data/parsers/nina';
import { geometryCenter } from '../../data/parsers/geocenter';
import { areaLayer } from '../../render/areas';
import type { AnyFeature } from '../../render/common';
import { rasterLayer } from '../../render/raster';
import type { ExpressionSpecification } from 'maplibre-gl';
import { defineLayer } from '../define';
import type { FeedItem, LayerContext, LayerHandle } from '../types';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { ReadonlySignal } from '@preact/signals';

const WFS = 'https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=dwd:Warnungen_Landkreise&outputFormat=application/json';
const LEVELS = [
  { color: '#FFEB3B', de: 'Wetterwarnung', short: 'Stufe 1 · gelb' },
  { color: '#FFA726', de: 'Markantes Wetter', short: 'Stufe 2 · orange' },
  { color: '#E53935', de: 'Unwetterwarnung', short: 'Stufe 3 · rot' },
  { color: '#8E24AA', de: 'Extremes Unwetter', short: 'Stufe 4 · violett' },
] as const;

const NINA_API = 'https://warnung.bund.de/api31';
type WarnProps = (DwdProps & { origin?: 'dwd'; sender?: string; source?: string; url?: string }) | NinaProps;
const cleanText = (v: string) => v.replace(/^Amtliche\s+/i, '');

export default defineLayer({
  id: 'unwetter-de',
  category: 'gefahren',
  title: 'Warnungen Deutschland',
  summary: 'Amtliche Wetterwarnungen des DWD und Bevölkerungswarnungen von NINA/BBK, Farbe nach Warnstufe',
  icon: 'warning',
  color: '#E53935',
  form: 'areas',
  cadence: 'minutes',
  coverage: 'DE',
  sources: [
    { name: 'Deutscher Wetterdienst (GeoServer)', url: 'https://www.dwd.de/DE/wetter/warnungen/warnWetter_node.html', license: 'DWD, GeoNutzV (Quellenangabe)' },
    { name: 'NINA / BBK (warnung.bund.de)', url: 'https://warnung.bund.de/', license: 'Bundesamt für Bevölkerungsschutz und Katastrophenhilfe, Open Data (Quellenangabe)' },
  ],
  options: [
    { id: 'quelle', label: 'Quelle', type: 'select', default: 'all', choices: [{ value: 'all', label: 'Alle' }, { value: 'dwd', label: 'Wetter (DWD)' }, { value: 'nina', label: 'Bevölkerung (NINA/BBK)' }] },{ id: 'minLevel', label: 'Mindest-Warnstufe', type: 'select', default: '1', choices: [{ value: '1', label: 'Alle Warnungen' }, { value: '2', label: 'Markantes Wetter und höher' }, { value: '3', label: 'Unwetter und höher' }] }],
  legend: (o) => {
    const dwd = LEVELS.map((l) => ({ color: l.color, label: `${l.de} (${l.short})`, shape: 'square' as const }));
    const nina = Object.values(NINA_SEVERITY).sort((a, b) => b.level - a.level).map((v) => ({ color: v.color, label: `Bevölkerungswarnung, ${v.de}`, shape: 'square' as const }));
    return { type: 'classes', items: o.quelle === 'dwd' ? dwd : o.quelle === 'nina' ? nina : [...dwd, ...nina] };
  },
  keywords: ['nina', 'bbk', 'mowas', 'katwarn', 'biwapp', 'bevölkerungsschutz', 'bevölkerungswarnung', 'polizei', 'hochwasser', 'warnung.bund.de', 'dwd', 'warnung', 'unwetter', 'gewitter', 'sturm', 'starkregen', 'frost', 'glätte', 'deutschland', 'warnwetter'],

  mount(ctx) {
    const res = ctx.resource<DwdCollection>({
      key: 'dwd:warnungen-landkreise',
      url: WFS,
      parse: 'dwdWarnings',
      refresh: 5 * MINUTE,
      timeout: 40_000,
      fallback: async () => dwdWarnings((await fetchJson(WFS, { timeout: 40_000 })).data),
    });
    // NINA: list per source (5 small files), then geometry and text per warning (cached, loaded in the background)
    const lists = NINA_SOURCES.map((src) =>
      ctx.resource<NinaListItem[]>({ key: `nina:${src}`, url: proxied(`${NINA_API}/${src}/mapData.json`), parse: 'ninaList', parseArgs: { src }, refresh: 5 * MINUTE, timeout: 30_000 }),
    );
    const geo = signal(new Map<string, NinaGeometry>());
    const details = signal(new Map<string, NinaDetail>());
    const wanted = new Set<string>();
    const queue: NinaListItem[] = [];
    let running = 0;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const flush = (g: Map<string, NinaGeometry>, d: Map<string, NinaDetail>) => {
      clearTimeout(flushTimer);
      flushTimer = setTimeout(() => { geo.value = new Map(g); details.value = new Map(d); }, 150);
    };
    const pump = () => {
      while (running < 6 && queue.length && !ctx.signal.aborted) {
        const it = queue.shift()!;
        running++;
        const key = `${it.id}@${it.version}`;
        const url = (ext: string) => proxied(`${NINA_API}/warnings/${encodeURIComponent(it.id)}.${ext}`);
        Promise.all([
          fetchJson(url('geojson'), { timeout: 20_000, signal: ctx.signal }).then((r) => ninaGeometry(r.data)),
          fetchJson(url('json'), { timeout: 20_000, signal: ctx.signal }).then((r) => ninaDetail(r.data)).catch(() => undefined),
        ])
          .then(([g, d]) => {
            const gm = new Map(geo.peek());
            const dm = new Map(details.peek());
            if (g) gm.set(it.id, g);
            if (d) dm.set(it.id, d);
            flush(gm, dm);
          })
          .catch(() => wanted.delete(key)) // tried again with the next list refresh
          .finally(() => { running--; pump(); });
      }
    };
    const stopNina = effect(() => {
      for (const r of lists) for (const it of r.data.value ?? []) {
        const key = `${it.id}@${it.version}`;
        if (wanted.has(key)) continue;
        wanted.add(key);
        queue.push(it);
      }
      pump();
    });
    const ninaItems = computed(() => (lists.every((r) => r.data.value === undefined) ? undefined : lists.flatMap((r) => r.data.value ?? [])));
    const ninaAll = computed(() => (ninaItems.value ? ninaFeatures(ninaItems.value, geo.value, details.value) : undefined));

    const visible = computed<FeatureCollection<Polygon | MultiPolygon, WarnProps> | undefined>(() => {
      const q = String(ctx.options.value.quelle ?? 'all');
      const d = q === 'nina' ? undefined : res.data.value;
      const n = q === 'dwd' ? undefined : ninaAll.value;
      if (!d && !n) return undefined;
      const min = Number(ctx.options.value.minLevel ?? 1);
      const t = ctx.time.value;
      const ok = (p: WarnProps) => p.level >= min && (!p.expires || p.expires >= t);
      const features = [
        ...(d?.features ?? []).filter((f) => ok(f.properties)).map((f) => ({ ...f, properties: { ...f.properties, origin: 'dwd' as const } })),
        ...(n?.features ?? []).filter((f) => ok(f.properties)),
      ] as Feature<Polygon | MultiPolygon, WarnProps>[];
      return { type: 'FeatureCollection', features };
    });
    // WMS stand-in while the vector data is not available
    let wms: LayerHandle | undefined;
    const reporting = Object.assign(Object.create(ctx), {
      status: (s: Parameters<LayerContext['status']>[0]) =>
        ctx.status(
          s.state === 'empty' ? { ...s, note: 'Derzeit keine Warnungen' } : s.state === 'error' && wms ? { state: 'ready', note: 'Nur als Kartenbild verfügbar, Warnungen sind nicht anklickbar' } : s,
        ),
    }) as LayerContext;

    const stop = effect(() => {
      const failed = res.state.value === 'error' && !res.data.value && ctx.options.value.quelle !== 'nina';
      if (failed && !wms) {
        wms = rasterLayer(ctx, {
          wms: { url: 'https://maps.dwd.de/geoserver/dwd/wms', layers: 'dwd:Warnungen_Gemeinden_vereinigt', format: 'image/png' },
          attribution: 'Warnungen © <a href="https://www.dwd.de/">DWD</a>',
          name: 'wms',
        });
      } else if (!failed && wms) {
        wms.destroy();
        wms = undefined;
      }
    });

    const area = areaLayer(reporting, {
      data: visible as unknown as ReadonlySignal<FeatureCollection | undefined>,
      resources: [res, ...lists],
      idKey: 'id',
      fill: ['get', 'color'] as ExpressionSpecification,
      fillOpacity: 0.42,
      outline: { color: ['get', 'color'] as ExpressionSpecification, width: 1.2 },
      describe: (f: AnyFeature) => {
        const p = f.properties as WarnProps;
        if (p.origin === 'nina') {
          const sev = NINA_SEVERITY[Object.keys(NINA_SEVERITY).find((k) => NINA_SEVERITY[k]!.level === p.level) ?? 'Moderate']!;
          return {
            title: p.headline,
            subtitle: `Bevölkerungswarnung · ${p.source}`,
            time: p.onset || undefined,
            color: p.color,
            icon: 'warning',
            facts: [
              { label: 'Schwere', value: sev.de.charAt(0).toUpperCase() + sev.de.slice(1), emphasis: p.level >= 3 },
              { label: 'Quelle', value: `NINA / BBK (${p.source})` },
              ...(p.sender ? [{ label: 'Herausgeber', value: p.sender }] : []),
              ...(p.onset ? [{ label: 'Gültig ab', value: formatDateTime(p.onset) }] : []),
              ...(p.expires ? [{ label: 'Gültig bis', value: `${formatDateTime(p.expires)} (${formatAge(p.expires)})` }] : []),
            ],
            text: [p.description, p.instruction && `Hinweise: ${p.instruction}`].filter(Boolean).join('\n\n') || 'Der Text der Meldung wird noch geladen oder ist nicht verfügbar.',
            links: [{ label: 'Meldung bei warnung.bund.de', url: p.url }],
          };
        }
        const l = LEVELS[p.level - 1]!;
        return {
          title: cleanText(p.headline) || l.de,
          subtitle: p.area,
          time: p.onset || undefined,
          color: p.color,
          icon: 'warning',
          facts: [
            { label: 'Stufe', value: `${l.de} (${l.short})`, emphasis: p.level >= 3 },
            ...(p.onset ? [{ label: 'Gültig ab', value: formatDateTime(p.onset) }] : []),
            ...(p.expires ? [{ label: 'Gültig bis', value: `${formatDateTime(p.expires)} (${formatAge(p.expires)})` }] : []),
            { label: 'Gebiet', value: p.state ? `${p.area} (${p.state})` : p.area },
          ],
          text: [p.description, p.instruction && `Hinweise: ${p.instruction}`].filter(Boolean).join('\n\n'),
          links: [{ label: 'Warnungen beim DWD', url: 'https://www.dwd.de/DE/wetter/warnungen/warnWetter_node.html' }],
        };
      },
      // one entry per warning, not per district: group by event, level and period
      feed: (features) => {
        const groups = new Map<string, { p: DwdProps; n: number; at: [number, number] | undefined }>();
        const civil: FeedItem[] = [];
        for (const f of features) {
          const p = f.properties as WarnProps;
          if (p.origin === 'nina') {
            civil.push({ id: p.id, title: p.headline, subtitle: `Bevölkerungswarnung · ${p.source}`, time: p.onset || undefined, magnitude: p.level, color: p.color, location: geometryCenter(f.geometry) ?? [10.4, 51.1] });
            continue;
          }
          const key = `${p.event}|${p.level}|${p.onset}|${p.expires}`;
          const g = groups.get(key);
          if (g) g.n++;
          else groups.set(key, { p, n: 1, at: geometryCenter(f.geometry) });
        }
        const dwd: FeedItem[] = [...groups.entries()]
          .sort((a, b) => b[1].p.level - a[1].p.level || b[1].p.onset - a[1].p.onset)
          .slice(0, 150)
          .map(([key, g]) => ({
            id: key,
            title: g.p.headline.replace(/^Amtliche\s+WARNUNG vor\s+/i, '') || g.p.event,
            subtitle: `${LEVELS[g.p.level - 1]!.de} · ${g.n === 1 ? g.p.area : `${formatInt(g.n)} Landkreise`}`,
            time: g.p.onset || undefined,
            magnitude: g.p.level,
            color: g.p.color,
            location: g.at ?? [10.4, 51.1],
          }));
        return [...civil.sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0)).slice(0, 80), ...dwd];
      },
    });
    return {
      destroy() {
        stop();
        stopNina();
        clearTimeout(flushTimer);
        queue.length = 0;
        wms?.destroy();
        area.destroy();
      },
    };
  },
});
