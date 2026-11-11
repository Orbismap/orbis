// Tropical cyclones of the NHC/CPHC (Atlantic, East and Central Pacific): cone, past track, forecast track, points.
// One layer, five kit instances. Only the point kit reports status and feed; the others stay quiet.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { formatAge, formatDateTime, formatNumber, withUnit } from '../../core/format';
import { formatQuantity } from '../../core/units';
import { MINUTE } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import { fetchJson } from '../../data/http';
import { areaLayer } from '../../render/areas';
import type { AnyFeature } from '../../render/common';
import { lineLayer } from '../../render/lines';
import { pointLayer } from '../../render/points';
import { defineLayer } from '../define';
import type { LayerContext } from '../types';

const KT = 1.852; // km/h per knot
const MPH = 1.609344;
const NHC = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer';
const PARTS = [['point', 5], ['fcst', 6], ['cone', 7], ['pastpt', 10], ['past', 11]] as const;

/** Saffir-Simpson scale on sustained wind (kt). */
const CLASSES: { min: number; color: string; label: string }[] = [
  { min: 0, color: '#5EBAFF', label: 'Tropisches Tief (< 34 kn)' },
  { min: 34, color: '#00FAF4', label: 'Tropischer Sturm (34–63 kn)' },
  { min: 64, color: '#FFFFCC', label: 'Hurrikan Kat. 1 (64–82 kn)' },
  { min: 83, color: '#FFE775', label: 'Kat. 2 (83–95 kn)' },
  { min: 96, color: '#FFC140', label: 'Kat. 3 (96–112 kn)' },
  { min: 113, color: '#FF8F20', label: 'Kat. 4 (113–136 kn)' },
  { min: 137, color: '#FF6060', label: 'Kat. 5 (ab 137 kn)' },
];
const windColor = (field: string): ExpressionSpecification =>
  ['step', ['to-number', ['get', field], 0], CLASSES[0]!.color, ...CLASSES.slice(1).flatMap((c) => [c.min, c.color])] as unknown as ExpressionSpecification;
const colorOfKt = (kt: number) => [...CLASSES].reverse().find((c) => kt >= c.min)!.color;

const TYPE_DE: Record<string, string> = {
  TD: 'Tropisches Tief', TS: 'Tropischer Sturm', HU: 'Hurrikan', MH: 'Starker Hurrikan', SD: 'Subtropisches Tief', SS: 'Subtropischer Sturm',
  EX: 'Außertropischer Sturm', PT: 'Posttropisches Tief', LO: 'Tiefdruckgebiet', DB: 'Störung', WV: 'Tiefdruckrinne', PTC: 'Möglicher tropischer Wirbelsturm',
};
const BASIN_DE: Record<string, string> = { AL: 'Atlantik', EP: 'Ostpazifik', CP: 'Zentralpazifik', WP: 'Westpazifik' };
const COMPASS = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]!;

const stormId = (p: Record<string, unknown>) => `${String(p.basin ?? '').toUpperCase()}${p.stormnum ?? ''}`;
const label = (p: Record<string, any>): string => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const kt = Number(p.maxwind) || 0;
  const t = String(p.stormtype ?? '');
  if (['EX', 'PT', 'LO', 'SD', 'SS', 'DB', 'WV', 'PTC'].includes(t)) return TYPE_DE[t]!;
  if (kt >= 64) {
    const cat = kt >= 137 ? 5 : kt >= 113 ? 4 : kt >= 96 ? 3 : kt >= 83 ? 2 : 1;
    return `Hurrikan Kat. ${cat}`;
  }
  return kt >= 34 ? TYPE_DE.TS! : TYPE_DE.TD!;
};
const cleanName = (n: unknown) => String(n ?? 'Unbenannt').replace(/\b(Tropical Storm|Tropical Depression|Hurricane|Major Hurricane|Post-Tropical Cyclone|Potential Tropical Cyclone|Subtropical Storm|Remnants Of|Tropical Cyclone)\s+/i, '').trim();

export default defineLayer({
  id: 'stuerme',
  category: 'gefahren',
  title: 'Wirbelstürme',
  summary: 'Tropische Wirbelstürme des NHC mit Zugbahn, Vorhersage und Unsicherheitskegel, Farbe nach Windstärke',
  icon: 'storm',
  color: '#00FAF4',
  form: 'points',
  cadence: 'minutes',
  coverage: 'Atlantik, Ost- und Zentralpazifik',
  sources: [
    { name: 'NOAA National Hurricane Center', url: 'https://www.nhc.noaa.gov/', license: 'gemeinfrei (US-Regierung)', manifest: { bucket: 'live', key: 'cyclones/nhc-point.geojson' } },
  ],
  legend: () => ({ type: 'classes', items: CLASSES.map((c) => ({ color: c.color, label: c.label })) }),
  keywords: ['hurrikan', 'taifun', 'zyklon', 'tropischer sturm', 'hurricane', 'cyclone', 'typhoon', 'nhc', 'sturm'],

  mount(ctx) {
    const res = Object.fromEntries(
      PARTS.map(([part, layer]) => [
        part,
        ctx.resource<FeatureCollection>({
          key: `live:nhc-${part}`,
          url: bucketUrl('live', `cyclones/nhc-${part}.geojson`),
          refresh: 5 * MINUTE,
          fallback: async () => (await fetchJson<FeatureCollection>(`${NHC}/${layer}/query?where=1%3D1&outFields=*&f=geojson`)).data,
        }),
      ]),
    ) as Record<(typeof PARTS)[number][0], ReturnType<typeof ctx.resource<FeatureCollection>>>;
    const all = Object.values(res);

    const storms = computed(() => {
      const d = res.point.data.value;
      return d ? new Set(d.features.map((f) => stormId(f.properties ?? {}))).size : undefined;
    });
    const quiet = Object.assign(Object.create(ctx), { status() {} }) as LayerContext;
    const reporting = Object.assign(Object.create(ctx), {
      status: (s: Parameters<LayerContext['status']>[0]) => ctx.status(s.state === 'empty' ? { ...s, note: 'Derzeit keine aktiven Stürme im Atlantik und Pazifik' } : s),
    }) as LayerContext;

    const handles = [
      areaLayer(quiet, {
        name: 'cone', data: res.cone, fill: '#8FDCFF', fillOpacity: 0.14, outline: { color: 'rgba(200,235,255,0.7)', width: 1 },
        describe: (f: AnyFeature) => ({
          title: `${cleanName(f.properties.stormname)}: Unsicherheitskegel`,
          subtitle: BASIN_DE[String(f.properties.basin).toUpperCase()] ?? String(f.properties.basin ?? ''),
          color: '#8FDCFF',
          icon: 'storm',
          facts: [{ label: 'Bedeutung', value: 'Mögliche Lage des Zentrums in den nächsten 5 Tagen' }],
          text: 'Der Kegel zeigt die Unsicherheit der Zugbahn des Zentrums, nicht die Ausdehnung des Sturms. Wind und Regen reichen weit darüber hinaus.',
          links: [{ label: 'National Hurricane Center', url: 'https://www.nhc.noaa.gov/' }],
        }),
      }),
      lineLayer(quiet, { name: 'past', data: res.past, color: '#C9D2DE', width: ['interpolate', ['linear'], ['zoom'], 1, 1.2, 8, 2.4] as ExpressionSpecification, casing: true, opacity: 0.9 }),
      lineLayer(quiet, { name: 'fcst', data: res.fcst, color: '#FFFFFF', width: ['interpolate', ['linear'], ['zoom'], 1, 1.2, 8, 2.4] as ExpressionSpecification, dash: [2, 2], casing: true, opacity: 0.95 }),
      pointLayer(quiet, {
        name: 'pastpt', data: res.pastpt, idKey: 'objectid', radius: ['interpolate', ['linear'], ['zoom'], 1, 2.2, 8, 4.5] as ExpressionSpecification, color: windColor('intensity'), minZoom: 2.5,
        describe: (f: AnyFeature) => {
          const p = f.properties;
          const t = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(String(p.hhmm).slice(0, 2)), Number(String(p.hhmm).slice(2)));
          const kt = Number(p.intensity) || 0;
          return {
            title: `${cleanName(p.stormname)}: bisheriger Verlauf`,
            subtitle: label({ ...p, maxwind: kt }),
            time: t,
            color: colorOfKt(kt),
            icon: 'storm',
            facts: [
              { label: 'Wind (Mittel)', value: formatQuantity('wind', kt * KT), emphasis: true },
              ...(Number(p.mslp) > 0 ? [{ label: 'Kerndruck', value: formatQuantity('pressure', Number(p.mslp)) }] : []),
              { label: 'Zeit', value: `${formatDateTime(t)} (${formatAge(t)})` },
            ],
          };
        },
      }),
      pointLayer(reporting, {
        data: res.point,
        resources: all,
        idKey: 'objectid',
        count: storms,
        radius: ['interpolate', ['linear'], ['zoom'], 1, ['case', ['==', ['get', 'tau'], 0], 6, 3.2], 8, ['case', ['==', ['get', 'tau'], 0], 13, 7]] as ExpressionSpecification,
        color: windColor('maxwind'),
        stroke: { color: '#FFFFFF', width: 1 },
        sortKey: ['case', ['==', ['get', 'tau'], 0], 10, ['-', 0, ['get', 'tau']]] as ExpressionSpecification,
        describe: (f: AnyFeature) => {
          const p = f.properties;
          const kt = Number(p.maxwind) || 0;
          const tau = Number(p.tau) || 0;
          const issued = Number(p.idp_filedate) || undefined;
          const hasMove = Number.isFinite(Number(p.tcspd)) && Number(p.tcspd) > 0 && Number.isFinite(Number(p.tcdir));
          const c = (f.geometry as { coordinates: number[] }).coordinates;
          return {
            title: String(p.stormname ?? 'Sturm'),
            subtitle: `${label(p)} · ${BASIN_DE[String(p.basin).toUpperCase()] ?? p.basin}${tau ? ` · Vorhersage +${tau} h` : ''}`,
            time: issued,
            color: colorOfKt(kt),
            icon: 'storm',
            facts: [
              { label: 'Anhaltender Wind', value: formatQuantity('wind', kt * KT), emphasis: true },
              ...(Number(p.gust) > 0 ? [{ label: 'Böen', value: formatQuantity('wind', Number(p.gust) * KT) }] : []),
              ...(Number(p.mslp) > 0 ? [{ label: 'Kerndruck', value: formatQuantity('pressure', Number(p.mslp)) }] : []),
              ...(hasMove ? [{ label: 'Zugrichtung', value: `${compass(Number(p.tcdir))} (${formatNumber(Number(p.tcdir))}°) mit ${formatQuantity('wind', Number(p.tcspd) * MPH)}` }] : []),
              { label: tau ? 'Gültig für' : 'Position', value: tau ? String(p.fldatelbl ?? `+${tau} h`) : 'aktuell' },
              { label: 'Meldung', value: `Nr. ${p.advisnum ?? '?'} · ${p.advdate ?? ''}`.trim() },
              { label: 'Vorhersagehorizont', value: withUnit(formatNumber(Number(p.fcstprd) || 0), 'h') },
            ],
            links: [{ label: 'National Hurricane Center', url: 'https://www.nhc.noaa.gov/' }],
            location: [c[0]!, c[1]!],
          };
        },
        feed: (features) =>
          features
            .filter((f) => Number(f.properties.tau) === 0)
            .sort((a, b) => Number(b.properties.maxwind) - Number(a.properties.maxwind))
            .map((f) => {
              const p = f.properties;
              const kt = Number(p.maxwind) || 0;
              const c = (f.geometry as { coordinates: number[] }).coordinates;
              return {
                id: stormId(p),
                title: String(p.stormname ?? 'Sturm'),
                subtitle: `${label(p)} · ${formatQuantity('wind', kt * KT)}`,
                time: Number(p.idp_filedate) || undefined,
                magnitude: kt,
                color: colorOfKt(kt),
                location: [c[0]!, c[1]!] as [number, number],
              };
            }),
      }),
    ];

    return {
      destroy() {
        for (const h of handles.reverse()) h.destroy();
      },
    };
  },
});
