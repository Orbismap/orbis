// City weather: temperature and a condition glyph at major cities, read from the ICON fields that are loaded anyway
// (no extra API calls). Zoom-dependent density by city rank; card with the 3-day outlook.
import { computed, effect, signal } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification, LayerSpecification } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { formatNumber } from '../../core/format';
import { formatQuantity } from '../../core/units';
import { ALL_CITIES } from '../../data/parsers/cities';
import type { OwxLatest } from '../../data/owx';
import { Cleanup, type AnyFeature } from '../../render/common';
import { cityIconId, drawCityIcon } from '../../render/gl/cityicons';
import { CONDITION_DE, cityOutlook, conditionOf, isDaylight, sampleCity, type Cond, type CityFields } from '../../render/gl/cityweather';
import { ICON_SOURCE, followLatest, forecastTime, noteOf } from '../../render/gl/latest';
import { acquireStore, type FieldStore } from '../../render/gl/store';
import { pointLayer } from '../../render/points';
import { describeError } from '../../data/http';
import { defineLayer } from '../define';
import type { LayerContext, LayerHandle } from '../types';

const VARS = ['temperature_2m', 'cloud_cover', 'precipitation', 'u', 'v'];
const CONDS: Cond[] = ['clear', 'clear-night', 'partly', 'partly-night', 'cloud', 'rain', 'snow'];
const RANKS = [{ rank: 1, minzoom: 0 }, { rank: 2, minzoom: 3.4 }, { rank: 3, minzoom: 5 }] as const;
const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });

export default defineLayer({
  id: 'staedte',
  category: 'wetter',
  title: 'Städtewetter',
  summary: 'Temperatur und Wetterlage großer Städte, beim Heranzoomen mehr Orte',
  icon: 'cloud',
  color: '#8FD0FF',
  form: 'points',
  cadence: 'hourly',
  sources: [ICON_SOURCE],
  time: forecastTime,
  legend: () => ({
    type: 'classes',
    items: [
      { color: '#FFD65A', label: 'Sonnig / klar', shape: 'dot' },
      { color: '#C9D3E2', label: 'Wolkig bis bedeckt', shape: 'dot' },
      { color: '#5BB8FF', label: 'Regen', shape: 'dot' },
      { color: '#FFFFFF', label: 'Schnee', shape: 'dot' },
    ],
  }),
  keywords: ['städte', 'stadt', 'wetter', 'temperatur', 'vorhersage', 'city', 'icon', 'dwd'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const clean = new Cleanup();
    for (const c of CONDS) if (!ml.hasImage(cityIconId(c))) ml.addImage(cityIconId(c), drawCityIcon(c), { pixelRatio: 2 });

    const model = signal<{ latest: OwxLatest; fields: CityFields } | undefined>(undefined);
    let held: { store: FieldStore; release(): void } | undefined;
    let unsub: (() => void) | undefined;
    clean.add(followLatest(ctx.signal, (latest) => {
      const next = acquireStore(latest, VARS, 2);
      const swap = () => {
        const ov = next.store.overview;
        if (!ov) {
          if (next.store.error && !held) ctx.status({ state: 'error', note: describeError(next.store.error) });
          return;
        }
        unsub?.();
        const old = held;
        held = next;
        const [t, cloud, precip, u, v] = ov.fields;
        model.value = { latest, fields: { t: t!, cloud: cloud!, precip: precip!, u: u!, v: v! } };
        unsub = undefined;
        old?.release();
      };
      unsub = next.store.subscribe(swap);
      swap();
    }, (e) => ctx.status({ state: 'error', note: describeError(e) })));
    clean.add(() => { unsub?.(); held?.release(); });

    const data = computed<FeatureCollection<Point> | undefined>(() => {
      const m = model.value;
      const at = ctx.time.value;
      if (!m) return undefined;
      formatQuantity('temperature', 0); // tracks the unit preference
      return {
        type: 'FeatureCollection',
        features: ALL_CITIES.flatMap(([name, lat, lng, rank]) => {
          const s = sampleCity(m.fields, m.latest.times, at, lng, lat);
          if (!s) return [];
          const cond = conditionOf(s.cloud, s.precip, s.t, isDaylight(lng, lat, at));
          return [{
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [lng, lat] },
            properties: { id: name, name, rank, t: s.t, cloud: s.cloud, precip: s.precip, wind: s.wind, cond, icon: cityIconId(cond), label: formatQuantity('temperature', s.t, { digits: 0 }).replace(/\s?°/, '°').replace(/\s.*$/, '') },
          }];
        }),
      };
    });

    effect(() => {
      const m = model.value;
      const d = data.value;
      if (m && d) ctx.status({ state: 'ready', count: d.features.length, updatedAt: m.latest.issued, note: noteOf(m.latest) });
    });

    const describe = (f: AnyFeature) => {
      const p = f.properties as { name: string; t: number; cloud: number; precip: number; wind: number; cond: Cond };
      const m = model.peek();
      const [lng, lat] = (f.geometry as Point).coordinates as [number, number];
      const outlook = m ? cityOutlook(m.fields, m.latest.times, ctx.time.peek(), lng, lat, 3) : [];
      return {
        title: p.name,
        subtitle: `${CONDITION_DE[p.cond]}, ${formatQuantity('temperature', p.t, { digits: 1 })}`,
        time: ctx.time.peek(),
        icon: 'cloud' as const,
        location: [lng, lat] as [number, number],
        facts: [
          { label: 'Temperatur', value: formatQuantity('temperature', p.t, { digits: 1 }), emphasis: true },
          { label: 'Wind', value: formatQuantity('wind', p.wind, { digits: 0 }) },
          { label: 'Bewölkung', value: `${formatNumber(p.cloud)} %` },
          { label: 'Niederschlag', value: formatQuantity('precip', p.precip, { digits: 1, rate: true }) },
        ],
        text: outlook.length
          ? outlook.map((d) => `${dayFmt.format(d.day)}: ${CONDITION_DE[d.cond]}, ${formatQuantity('temperature', d.min, { digits: 0 })} bis ${formatQuantity('temperature', d.max, { digits: 0 })}, Wind bis ${formatQuantity('wind', d.wind, { digits: 0 })}, Niederschlag ${formatQuantity('precip', d.precip, { digits: 1 })}`).join('\n')
          : undefined,
        links: [{ label: 'ICON beim DWD', url: 'https://www.dwd.de/DE/forschung/wettervorhersage/num_modellierung/01_num_vorhersagemodelle/icon_beschreibung/icon_beschreibung_node.html' }],
      };
    };

    const quiet = (on: boolean) => Object.assign(Object.create(ctx), on ? {} : { status() {}, feed() {} }) as LayerContext;
    const handles: LayerHandle[] = [];
    const ids: string[] = [];
    RANKS.forEach(({ rank, minzoom }, i) => {
      const filter: FilterSpecification = ['==', ['get', 'rank'], rank];
      const name = `r${rank}`;
      handles.push(pointLayer(quiet(false), { data, name, radius: 13, color: 'rgba(0,0,0,0.01)', stroke: { color: 'rgba(0,0,0,0)', width: 0 }, filter: signal(filter), minZoom: minzoom, describe }));
      const id = `${ctx.id}.${name}-labels`;
      ids.push(id);
      ctx.map.addLayer({
        id, type: 'symbol', source: `${ctx.id}.${name}-src`, minzoom, filter,
        layout: {
          'icon-image': ['get', 'icon'] as unknown as ExpressionSpecification, 'icon-size': 0.62 + (3 - rank) * 0.08, 'icon-allow-overlap': false,
          'text-field': ['get', 'label'] as unknown as ExpressionSpecification, 'text-font': ['Noto Sans Regular'], 'text-size': 12 + (3 - rank), 'text-anchor': 'left',
          'text-offset': [0.95, 0], 'text-optional': true, 'symbol-sort-key': i,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(10, 15, 24, 0.9)', 'text-halo-width': 1.5 },
      } as LayerSpecification, 'labels');
    });
    clean.add(effect(() => {
      const o = ctx.opacity.value;
      for (const id of ids) if (ml.getLayer(id)) { ml.setPaintProperty(id, 'text-opacity', o); ml.setPaintProperty(id, 'icon-opacity', o); }
    }));
    return {
      destroy() {
        clean.run();
        ctx.map.remove({ layers: ids });
        for (const h of handles.reverse()) h.destroy();
      },
    };
  },
});
