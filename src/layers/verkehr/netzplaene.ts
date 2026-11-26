// Network plans drawn on the map, like the printed ones: rail lines in their colours side by side, straight from station
// to station, with station names and line numbers. The plans of the whole world are computed from OpenStreetMap by the data
// repo (collectors/netzplan.mjs, monthly) and come as one PMTiles file per network in the osm bucket: this layer styles them.
import { computed, effect, signal, untracked } from '@preact/signals';
import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import { osmPmtilesUrl } from '../../data/osmfiles';
import { ensurePmtilesProtocol } from '../../map/pmtiles-protocol';
import { bindOpacity, type AnyFeature } from '../../render/common';
import { vectorTileLayer, type VtPart } from '../../render/vectortiles';
import { defineLayer } from '../define';
import type { InspectCard, LayerHandle, OptionValues } from '../types';

/** zoom range of the files */
const MIN_ZOOM = 6;
const MAX_ZOOM = 12;
/** stations are in the tiles from here on */
const STATION_ZOOM = 8;

// The modes of the plans (the colours are those the collector gives to lines without a colour in OSM).
const MODES = {
  regional: { label: 'Regionalbahn', color: '#d9232e' },
  sbahn: { label: 'S-Bahn / Vorortbahn', color: '#008d4f' },
  ubahn: { label: 'U-Bahn', color: '#1561a9' },
  stadtbahn: { label: 'Stadtbahn', color: '#e2571e' },
  tram: { label: 'Tram', color: '#be1414' },
} as const;
type Mode = keyof typeof MODES;

const isRegion = (o: OptionValues) => o.netz === 'region';
const modesOf = (o: OptionValues): Mode[] =>
  isRegion(o) ? ['regional', 'sbahn'] : o.tram === false ? ['sbahn', 'ubahn', 'stadtbahn'] : ['sbahn', 'ubahn', 'stadtbahn', 'tram'];
/** the file (set name in the osm bucket) of the chosen network */
export const netzFile = (o: OptionValues) => (isRegion(o) ? 'netz-region' : o.tram === false ? 'netz-stadt' : 'netz-stadt-tram');

const REGULAR = ['Noto Sans Regular'];
const BOLD = ['Noto Sans Bold'];
const INK = '#14181f';
const HALO = '#ffffff';
/** lines named under a terminus (properties end0.., color0..) */
const END_BADGES = 4;

const ex = (e: unknown) => e as ExpressionSpecification;
/** A value per zoom step 6, 8, 11 and 14. */
const byZoom = (world: unknown, far: unknown, city: unknown, close: unknown) => ex(['interpolate', ['linear'], ['zoom'], 6, world, 8, far, 11, city, 14, close]);
const sideways = (px: number) => ['*', ['get', 'off'], px];

/** Station name, below it the lines ending there in their colours. */
const stationText = ex([
  'format',
  ['get', 'name'], {},
  ['case', ['has', 'end0'], '\n', ''], {},
  ...Array.from({ length: END_BADGES }, (_, i) => [
    ['concat', i ? ['case', ['has', `end${i}`], '  ', ''] : '', ['coalesce', ['get', `end${i}`], '']],
    { 'text-font': ['literal', BOLD], 'text-color': ['to-color', ['coalesce', ['get', `color${i}`], INK]], 'font-scale': 0.9 },
  ]).flat(),
]);

const PARTS: VtPart[] = [
  {
    id: 'lines', sourceLayer: 'lines', kind: 'line', color: ex(['to-color', ['get', 'color']]), casing: HALO,
    size: byZoom(1, 1.4, 3, 6), offset: byZoom(sideways(1.2), sideways(1.6), sideways(3.4), sideways(6.6)),
  },
  {
    id: 'numbers', sourceLayer: 'labels', kind: 'text', slot: 'points', minZoom: 9.5,
    color: ex(['to-color', ['get', 'color']]), halo: { color: HALO, width: 1.6 },
    layout: {
      'symbol-placement': 'line', 'symbol-spacing': 320, 'text-field': ['get', 'refs'], 'text-font': BOLD,
      'text-size': ex(['interpolate', ['linear'], ['zoom'], 9.5, 9, 11, 10, 14, 12]), 'text-max-angle': 30,
      // above the bundle, further out the wider it is
      'text-offset': ex(['match', ['get', 'n'], 1, ['literal', [0, -0.9]], 2, ['literal', [0, -1.1]], 3, ['literal', [0, -1.4]], 4, ['literal', [0, -1.7]], ['literal', [0, -2.1]]]),
    },
  },
  {
    id: 'stations', sourceLayer: 'stations', kind: 'circle', color: HALO, casing: true, minZoom: STATION_ZOOM,
    size: ex(['interpolate', ['linear'], ['zoom'],
      8, ['case', ['==', ['get', 'rank'], 2], 2.4, 1.2],
      11, ['min', 9, ['max', 2.6, ['*', ['get', 'n'], 1.8]]],
      14, ['min', 16, ['max', 5, ['*', ['get', 'n'], 3.2]]],
    ]),
  },
  {
    id: 'names', sourceLayer: 'stations', kind: 'text', color: INK, halo: { color: HALO, width: 1.8 }, minZoom: STATION_ZOOM,
    // far out only interchanges and ends of lines, the rest from city zoom on
    filter: ex(['step', ['zoom'], ['==', ['get', 'rank'], 2], 9.3, ['>=', ['get', 'rank'], 1], 10.6, true]),
    layout: {
      'text-field': stationText, 'text-font': ex(['case', ['>=', ['get', 'rank'], 1], ['literal', BOLD], ['literal', REGULAR]]),
      'text-size': ex(['interpolate', ['linear'], ['zoom'], 8, 10, 11, 11.5, 14, 13.5]), 'text-max-width': 11,
      'text-variable-anchor': ['left', 'right', 'top', 'bottom', 'top-left', 'bottom-right', 'bottom-left', 'top-right'],
      // clear of the station dot, which grows with the width of the bundle
      'text-radial-offset': ex(['+', 0.45, ['*', ['min', ['get', 'n'], 5], 0.18]]), 'text-justify': 'auto',
      'symbol-sort-key': ex(['-', 0, ['+', ['*', ['get', 'rank'], 100], ['get', 'n']]]),
    },
  },
];

export const netzplanCard = (f: AnyFeature, part: VtPart): InspectCard => {
  const p = f.properties as { id: number; refs: string; name?: string; rank?: number; mode?: Mode; color?: string };
  if (part.id !== 'stations') return { title: p.refs, subtitle: MODES[p.mode!]?.label, color: p.color, icon: 'train', facts: [] };
  return {
    title: p.name ?? 'Haltestelle', subtitle: p.rank === 2 ? 'Umsteigebahnhof' : 'Haltestelle', icon: 'train',
    facts: [{ label: 'Linien', value: p.refs, emphasis: true }],
    links: [{ label: 'OpenStreetMap', url: `https://www.openstreetmap.org/node/${p.id}` }],
  };
};

export default defineLayer({
  id: 'netzplaene',
  category: 'verkehr',
  title: 'Netzpläne',
  summary: 'Liniennetz als Plan: Linien in ihren Farben mit Haltestellennamen, für Stadt oder Region',
  icon: 'train',
  color: '#008d4f',
  form: 'lines',
  cadence: 'daily',
  coverage: 'Welt (OpenStreetMap, monatlicher Stand)',
  minZoom: MIN_ZOOM,
  sources: [{ name: 'OpenStreetMap-Mitwirkende (Monatsauszug)', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', manifest: { bucket: 'osm', key: 'netz-region.pmtiles' } }],
  options: [
    { id: 'netz', label: 'Netz', type: 'select', default: 'stadt', choices: [{ value: 'stadt', label: 'Stadtnetz (S- und U-Bahn)' }, { value: 'region', label: 'Regionalnetz (Regional- und S-Bahn)' }] },
    { id: 'tram', label: 'Tram', type: 'toggle', default: true, when: (o) => !isRegion(o) },
    { id: 'plan', label: 'Karte abblenden', type: 'toggle', default: true },
  ],
  legend: (o) => ({
    type: 'classes',
    items: modesOf(o).map((m) => ({ color: MODES[m].color, label: `${MODES[m].label} (ohne eigene Linienfarbe)`, shape: 'line' as const })),
  }),
  keywords: ['netzplan', 'liniennetz', 'liniennetzplan', 'haltestellen', 'bahnhöfe', 's-bahn', 'u-bahn', 'tram', 'regionalbahn', 'öpnv', 'nahverkehr', 'vbb', 'bvg', 'transit map'],

  mount(ctx) {
    // the pale sheet of the plan over the map (once tiles are there); labels of the basemap stay above it
    const sheet = `${ctx.id}.sheet`;
    ctx.map.addLayer({ id: sheet, type: 'background', minzoom: MIN_ZOOM, layout: { visibility: 'none' }, paint: { 'background-color': '#f6f5f1', 'background-opacity': 0.86 } } as LayerSpecification, 'areas');
    const loaded = signal(false);
    const stopSheet = effect(() => {
      const on = ctx.options.value.plan !== false && loaded.value;
      ctx.map.ml.setLayoutProperty(sheet, 'visibility', on ? 'visible' : 'none');
    });
    const stopSheetOpacity = bindOpacity(ctx, ctx.map.ml, [{ layer: sheet, prop: 'background-opacity', base: 0.86 }]);

    // one file per network: choosing another one swaps the source
    const file = computed(() => netzFile(ctx.options.value));
    let plan: LayerHandle | undefined;
    let wanted: string | undefined; // undefined after destroy
    const stopPlan = effect(() => {
      const name = file.value;
      wanted = name;
      untracked(() => {
        plan?.destroy();
        plan = undefined;
        loaded.value = false;
        ctx.status({ state: 'loading' });
      });
      void Promise.all([osmPmtilesUrl(name), ensurePmtilesProtocol()]).then(([url]) => {
        if (wanted !== name || plan || ctx.signal.aborted) return;
        plan = vectorTileLayer({ ...ctx, status: (s) => { loaded.value = s.state === 'ready'; ctx.status(s); } }, {
          tiles: `pmtiles://${url}/{z}/{x}/{y}`, minzoom: MIN_ZOOM, maxzoom: MAX_ZOOM,
          attribution: '© OpenStreetMap-Mitwirkende (ODbL)', idKey: 'id', parts: PARTS, describe: netzplanCard,
          errorNote: 'Netzplan-Kacheln nicht ladbar',
        });
      });
    });

    return {
      destroy: () => {
        stopPlan(); stopSheet(); stopSheetOpacity();
        wanted = undefined;
        plan?.destroy();
        ctx.map.remove({ layers: [sheet] });
      },
    };
  },
});
