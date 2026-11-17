// Power plants, wind parks, wind turbines and storage from two sources in one layer: OpenStreetMap (OpenInfraMap tiles, from zoom 5)
// and the WRI Global Power Plant Database (parsed in the worker). WRI plants that OpenStreetMap also has are hidden (data/plantMerge).
// Colour = fuel class, area = capacity, the world view shows only the large plants.
import { computed, effect, signal } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { formatNumber } from '../../core/format';
import { bucketUrl } from '../../data/endpoints';
import { FUELS, FUEL_ORDER, type FuelClass, type PlantCollection, type PlantProps } from '../../data/parsers/powerplants';
import { PlantMatcher, fuelClassOfOsm } from '../../data/plantMerge';
import type { AnyFeature } from '../../render/common';
import { pointLayer } from '../../render/points';
import { vectorTileLayer } from '../../render/vectortiles';
import { OIM_ATTRIBUTION, OIM_SOURCE, oimTiles } from '../../data/openinframap';
import { OSM_PLANTS_MIN_ZOOM, OSM_SOURCES, describeOsmPlant, osmPlantFilter, osmPlantParts } from '../../data/oimPlants';
import { defineLayer } from '../define';
import { multiValues } from '../multi';

const COLOR = '#F5B73D';

/** Smallest plant (MW) shown at the integer zoom level (index), so the world view stays readable. */
const MIN_MW_BY_ZOOM = [2000, 1000, 600, 300, 150, 80, 40, 15, 5, 0];
const minMwAt = (z: number) => MIN_MW_BY_ZOOM[Math.min(MIN_MW_BY_ZOOM.length - 1, Math.max(0, Math.floor(z)))]!;

const colorExpr = ['match', ['get', 'fuel'], ...FUEL_ORDER.flatMap((k) => [k, FUELS[k].color]), FUELS.other.color] as unknown as ExpressionSpecification;
/** Radius in px: grows with the square root of the capacity (area ~ MW) and with the zoom. */
const sizes = (k: number, min: number, max: number): ExpressionSpecification => ['max', min, ['min', max, ['*', k, ['sqrt', ['get', 'mw']]]]] as ExpressionSpecification;
const radius = ['interpolate', ['linear'], ['zoom'], 1, sizes(0.07, 1.6, 9), 5, sizes(0.15, 2.2, 15), 9, sizes(0.3, 3.5, 24), 13, sizes(0.5, 5, 34)] as ExpressionSpecification;

const power = (mw: number) => (mw >= 1000 ? `${formatNumber(mw / 1000, mw >= 10_000 ? 1 : 2)} GW` : `${formatNumber(mw, mw < 10 ? 1 : 0)} MW`);

export default defineLayer({
  id: 'kraftwerke',
  category: 'infrastruktur',
  title: 'Kraftwerke',
  summary: 'Kraftwerke, Windparks, Windräder und Speicher, Farbe nach Energieträger, Größe nach Leistung',
  icon: 'power',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  sources: [
    OIM_SOURCE,
    {
      name: 'WRI Global Power Plant Database', url: 'https://datasets.wri.org/dataset/globalpowerplantdatabase',
      license: 'CC BY 4.0, World Resources Institute', manifest: { bucket: 'data', key: 'wri/powerplants.json' },
    },
  ],
  options: [
    {
      id: 'fuel', label: 'Energieträger', type: 'multi', default: 'all',
      choices: [{ value: 'all', label: 'Alle' }, ...FUEL_ORDER.map((k) => ({ value: k, label: FUELS[k].label })), { value: 'storage', label: 'Speicher (nur OpenStreetMap)' }],
    },
    { id: 'minMw', label: 'Mindestleistung', type: 'range', min: 0, max: 2000, step: 10, default: 0, unit: 'MW' },
  ],
  legend: {
    type: 'classes',
    items: [...FUEL_ORDER.map((k) => ({ color: FUELS[k].color, label: FUELS[k].label })), { color: OSM_SOURCES.battery!.color, label: 'Batterie (OpenStreetMap)' }],
  },
  keywords: ['windrad', 'windräder', 'windpark', 'windkraft', 'turbine', 'speicher', 'pumpspeicher', 'batterie', 'openinframap', 'osm', 'strom', 'energie', 'wind', 'solar', 'kohle', 'gas', 'atom', 'kernkraft', 'wasserkraft', 'power plant', 'wri'],

  mount(ctx) {
    const plants = ctx.resource<PlantCollection>({ key: 'data:wri-powerplants', url: bucketUrl('data', 'wri/powerplants.json'), parse: 'powerPlants', timeout: 40_000 });

    const ml = ctx.map.ml;
    const zoom = signal(ml.getZoom());
    const onZoom = () => { const z = Math.floor(ml.getZoom()); if (z !== zoom.peek()) zoom.value = z; };
    ml.on('zoom', onZoom);

    // --- OpenStreetMap: its plants are always drawn (from zoom 5, where the tiles have them)
    const osmFilter = computed<FilterSpecification>(() => osmPlantFilter(String(ctx.options.value.fuel ?? 'all'), Number(ctx.options.value.minMw ?? 0)));
    const osmSource = `${ctx.id}.osm-src`;
    // the WRI layer reports the status of the row (the OSM tiles are not requested below zoom 5)
    const osm = vectorTileLayer({ ...ctx, status: () => {} }, { tiles: oimTiles('power'), name: 'osm', attribution: OIM_ATTRIBUTION, parts: osmPlantParts(osmFilter), describe: describeOsmPlant });

    // --- duplicate check: WRI plants with an OSM counterpart are hidden. The OSM objects come from the loaded tiles.
    let matcher = new PlantMatcher(undefined);
    const hiddenCount = signal(0);
    const alive = { v: true };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const OSM_LIVE = ['all', ['!=', ['get', 'disused'], true], ['!=', ['get', 'construction'], true]] as FilterSpecification;
    const scan = () => {
      if (!alive.v || !ml.getSource(osmSource)) return;
      let changed = false;
      for (const sourceLayer of ['power_plant_point', 'power_generator'] as const) {
        for (const f of ml.querySourceFeatures(osmSource, { sourceLayer, filter: OSM_LIVE })) {
          if (f.geometry.type !== 'Point') continue;
          const [lng, lat] = f.geometry.coordinates as [number, number];
          if (matcher.addPoint(lng, lat, fuelClassOfOsm(f.properties?.source))) changed = true;
        }
      }
      for (const f of ml.querySourceFeatures(osmSource, { sourceLayer: 'power_plant', filter: OSM_LIVE })) {
        const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates.flat() : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat(2) : [];
        if (!ring.length) continue;
        let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
        for (const [lng, lat] of ring as [number, number][]) (lng < w && (w = lng), lng > e && (e = lng), lat < s && (s = lat), lat > n && (n = lat));
        if (matcher.addArea([w, s, e, n], fuelClassOfOsm(f.properties?.source))) changed = true;
      }
      if (changed) hiddenCount.value = matcher.hidden.size;
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(scan, 250); };
    const onSourceData = (e: { sourceId?: string }) => { if (e.sourceId === osmSource) schedule(); };
    ml.on('sourcedata', onSourceData as never);
    ml.on('moveend', schedule);
    const stopMatcher = effect(() => {
      matcher = new PlantMatcher(plants.data.value);
      hiddenCount.value = 0;
      schedule();
    });

    // --- WRI
    const filter = computed<FilterSpecification>(() => {
      const o = ctx.options.value;
      const fuels = multiValues(o.fuel)?.filter((f) => f !== 'storage'); // WRI has no storage
      if (fuels?.length === 0) return ['==', ['get', 'mw'], -1] as FilterSpecification;
      const parts: unknown[] = [['>=', ['get', 'mw'], Math.max(Number(o.minMw ?? 0), minMwAt(zoom.value))]];
      if (fuels) parts.push(['in', ['get', 'fuel'], ['literal', fuels]]);
      // matches only count while the OSM plants are on the map: zoomed out below their zoom, WRI shows everything again
      if (zoom.value >= OSM_PLANTS_MIN_ZOOM && hiddenCount.value > 0) parts.push(['!', ['in', ['get', 'id'], ['literal', [...matcher.hidden]]]]);
      return ['all', ...parts] as FilterSpecification;
    });

    const handle = pointLayer(ctx, {
      data: plants,
      radius,
      color: colorExpr,
      stroke: { color: 'rgba(8, 12, 20, 0.7)', width: 0.8 },
      sortKey: ['get', 'mw'] as ExpressionSpecification, // small ones first, the big ones on top
      filter,
      describe: (f: AnyFeature) => {
        const p = f.properties as PlantProps;
        const fuel = FUELS[p.fuel as FuelClass];
        return {
          title: p.name,
          subtitle: `${fuel.label}${p.country ? ` · ${p.country}` : ''} · WRI`,
          color: fuel.color,
          icon: 'power',
          facts: [
            { label: 'Leistung', value: power(p.mw), emphasis: true },
            { label: 'Energieträger', value: p.fuel === 'other' && p.fuelRaw ? p.fuelRaw : fuel.label },
            ...(p.country ? [{ label: 'Land', value: p.country }] : []),
            ...(p.year ? [{ label: 'In Betrieb seit', value: String(p.year) }] : []),
            ...(p.owner ? [{ label: 'Betreiber', value: p.owner }] : []),
          ],
          links: [...(p.url ? [{ label: 'Quelle zur Anlage', url: p.url }] : []), { label: 'WRI Global Power Plant Database', url: 'https://datasets.wri.org/dataset/globalpowerplantdatabase' }],
        };
      },
    });
    return {
      destroy() {
        alive.v = false;
        clearTimeout(timer);
        stopMatcher();
        ml.off('zoom', onZoom);
        ml.off('sourcedata', onSourceData as never);
        ml.off('moveend', schedule);
        osm.destroy();
        handle.destroy();
      },
    };
  },
});
