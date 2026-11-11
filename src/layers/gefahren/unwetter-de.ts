// DWD official weather warnings for Germany (WFS, district level) as clickable areas in the official colours.
// If the WFS is unreachable the WMS image of the same warnings stands in (not clickable).
import { computed, effect } from '@preact/signals';
import { formatAge, formatDateTime, formatInt } from '../../core/format';
import { MINUTE } from '../../core/time';
import { fetchJson } from '../../data/http';
import { dwdWarnings, type DwdCollection, type DwdProps } from '../../data/parsers/dwd';
import { geometryCenter } from '../../data/parsers/geocenter';
import { areaLayer } from '../../render/areas';
import type { AnyFeature } from '../../render/common';
import { rasterLayer } from '../../render/raster';
import type { ExpressionSpecification } from 'maplibre-gl';
import { defineLayer } from '../define';
import type { LayerContext, LayerHandle } from '../types';

const WFS = 'https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=dwd:Warnungen_Landkreise&outputFormat=application/json';
const LEVELS = [
  { color: '#FFEB3B', de: 'Wetterwarnung', short: 'Stufe 1 · gelb' },
  { color: '#FFA726', de: 'Markantes Wetter', short: 'Stufe 2 · orange' },
  { color: '#E53935', de: 'Unwetterwarnung', short: 'Stufe 3 · rot' },
  { color: '#8E24AA', de: 'Extremes Unwetter', short: 'Stufe 4 · violett' },
] as const;

export default defineLayer({
  id: 'unwetter-de',
  category: 'gefahren',
  title: 'Unwetter Deutschland',
  summary: 'Amtliche Warnungen des Deutschen Wetterdienstes je Landkreis, Farbe nach Warnstufe',
  icon: 'warning',
  color: '#E53935',
  form: 'areas',
  cadence: 'minutes',
  coverage: 'DE',
  sources: [{ name: 'Deutscher Wetterdienst (GeoServer)', url: 'https://www.dwd.de/DE/wetter/warnungen/warnWetter_node.html', license: 'DWD, GeoNutzV (Quellenangabe)' }],
  options: [{ id: 'minLevel', label: 'Mindest-Warnstufe', type: 'select', default: '1', choices: [{ value: '1', label: 'Alle Warnungen' }, { value: '2', label: 'Markantes Wetter und höher' }, { value: '3', label: 'Unwetter und höher' }] }],
  legend: () => ({ type: 'classes', items: LEVELS.map((l) => ({ color: l.color, label: `${l.de} (${l.short})`, shape: 'square' as const })) }),
  keywords: ['dwd', 'warnung', 'unwetter', 'gewitter', 'sturm', 'starkregen', 'frost', 'glätte', 'deutschland', 'warnwetter'],

  mount(ctx) {
    const res = ctx.resource<DwdCollection>({
      key: 'dwd:warnungen-landkreise',
      url: WFS,
      parse: 'dwdWarnings',
      refresh: 5 * MINUTE,
      timeout: 40_000,
      fallback: async () => dwdWarnings((await fetchJson(WFS, { timeout: 40_000 })).data),
    });
    const visible = computed<DwdCollection | undefined>(() => {
      const d = res.data.value;
      if (!d) return undefined;
      const min = Number(ctx.options.value.minLevel ?? 1);
      const t = ctx.time.value;
      return { type: 'FeatureCollection', features: d.features.filter((f) => f.properties.level >= min && (!f.properties.expires || f.properties.expires >= t)) };
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
      const failed = res.state.value === 'error' && !res.data.value;
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
      data: visible,
      resources: [res],
      idKey: 'id',
      fill: ['get', 'color'] as ExpressionSpecification,
      fillOpacity: 0.42,
      outline: { color: ['get', 'color'] as ExpressionSpecification, width: 1.2 },
      describe: (f: AnyFeature) => {
        const p = f.properties as DwdProps;
        const l = LEVELS[p.level - 1]!;
        return {
          title: p.headline.replace(/^Amtliche\s+/i, '') || l.de,
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
        for (const f of features) {
          const p = f.properties as DwdProps;
          const key = `${p.event}|${p.level}|${p.onset}|${p.expires}`;
          const g = groups.get(key);
          if (g) g.n++;
          else groups.set(key, { p, n: 1, at: geometryCenter(f.geometry) });
        }
        return [...groups.entries()]
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
      },
    });
    return {
      destroy() {
        stop();
        wms?.destroy();
        area.destroy();
      },
    };
  },
});
