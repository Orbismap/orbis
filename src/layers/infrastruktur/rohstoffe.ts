// Mineral and fuel deposits: Wikidata mines and oil/gas/coal fields (single points from the world view on, parsed in the worker),
// plus OpenStreetMap quarries, shafts and wells from resource.pmtiles once zoomed in.
import { computed, signal } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { bucketUrl } from '../../data/endpoints';
import { osmPmtilesUrl } from '../../data/osmfiles';
import { fetchRaw } from '../../data/http';
import { mrdsSites, type MrdsCollection, type MrdsProps } from '../../data/parsers/mrds';
import { rasterLayer } from '../../render/raster';
import { RESOURCE_GROUPS, RESOURCE_ORDER, type ResourceCollection, type ResourceGroup, type ResourceProps } from '../../data/parsers/resources';
import { pmtilesLayer } from '../../render/pmtiles';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';
import { multiValues } from '../multi';

const COLOR = '#F29B1D';
const DETAIL_ZOOM = 9;
const REGIONAL_ZOOM = 6;
const KOR250 = 'https://services.bgr.de/arcgis/rest/services/inspire_mr/kor250/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image';
const MRDS_WFS = 'https://mrdata.usgs.gov/services/wfs/mrds?service=WFS&version=1.0.0&request=GetFeature&typeName=mrds&maxFeatures=4000';
const US_BOX = { w: -180, s: 17, e: -64, n: 72 };
const EMPTY_MRDS: MrdsCollection = { type: 'FeatureCollection', features: [] };

const G = (k: ResourceGroup) => RESOURCE_GROUPS[k].color;
const groupColor = ['match', ['get', 'group'], ...RESOURCE_ORDER.flatMap((k) => [k, G(k)]), G('other')] as unknown as ExpressionSpecification;

/** OSM detail points: group guessed from the keyword/resource tags, wells default to oil & gas. */
const haystack: ExpressionSpecification = ['downcase', ['concat', ['coalesce', ['get', 'words'], ''], ' ', ['coalesce', ['get', 'resource'], '']]] as unknown as ExpressionSpecification;
const has = (...words: string[]): ExpressionSpecification =>
  (words.length === 1 ? ['in', words[0], ['var', 'h']] : ['any', ...words.map((w) => ['in', w, ['var', 'h']])]) as unknown as ExpressionSpecification;
const osmColor = ['let', 'h', haystack, ['case',
  has('uranium'), G('uranium'),
  has('oil', 'gas', 'petrol'), G('oilgas'),
  ['==', ['get', 'kind'], 'Bohrloch'], G('oilgas'),
  has('coal', 'lignite', 'anthracite'), G('coal'),
  has('salt', 'potash'), G('salt'),
  has('diamond', 'emerald', 'sapphire', 'ruby', 'gem'), G('gem'),
  has('ore', 'gold', 'silver', 'copper', 'iron', 'lead', 'zinc', 'tin', 'nickel', 'mangan', 'bauxite', 'chrom', 'lithium', 'tungsten'), G('metal'),
  G('other'),
]] as unknown as ExpressionSpecification;

export default defineLayer({
  id: 'rohstoffe',
  category: 'infrastruktur',
  title: 'Rohstoffe',
  summary: 'Bergwerke, Öl-, Gas- und Kohlefelder; USA und Deutschland ab Zoomstufe 6 genauer, Gruben und Bohrlöcher ab 9',
  icon: 'mine',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  coverage: 'Welt; USA (MRDS) und Deutschland (KOR250) detaillierter',
  sources: [
    { name: 'Wikidata', url: 'https://www.wikidata.org/', license: 'CC0 1.0', manifest: { bucket: 'data', key: 'wikidata/resources.json' } },
    { name: 'USGS Mineral Resources Data System (MRDS), nur USA, ab Zoomstufe 6', url: 'https://mrdata.usgs.gov/mrds/', license: 'Public Domain (US-Regierung)' },
    { name: 'BGR, Karte oberflächennaher Rohstoffe KOR250 (nur Deutschland, ab Zoomstufe 6)', url: 'https://www.bgr.bund.de/', license: 'GeoNutzV, Quellenvermerk BGR' },
    { name: 'OpenStreetMap-Mitwirkende', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', manifest: { bucket: 'osm', key: 'resource.pmtiles' } },
  ],
  options: [{ id: 'group', label: 'Rohstoff', type: 'multi', default: 'all', choices: [{ value: 'all', label: 'Alle' }, ...RESOURCE_ORDER.map((k) => ({ value: k, label: RESOURCE_GROUPS[k].label }))] }],
  legend: { type: 'classes', items: [...RESOURCE_ORDER.map((k) => ({ color: G(k), label: RESOURCE_GROUPS[k].label })), { color: '#9C7A4F', label: 'Deutschland: BGR-Rohstoffkarte KOR250 (Flächen, ab Zoom 6)', shape: 'square' as const }] },
  keywords: ['mine', 'bergbau', 'bergwerk', 'öl', 'gas', 'kohle', 'gold', 'kupfer', 'lithium', 'uran', 'steinbruch', 'erz', 'ölfeld'],

  mount(ctx) {
    const wd = ctx.resource<ResourceCollection>({ key: 'data:wikidata-resources', url: bucketUrl('data', 'wikidata/resources.json'), parse: 'wikiResources', timeout: 40_000 });
    const shown = computed<ResourceCollection | undefined>(() => {
      const d = wd.data.value;
      const g = multiValues(ctx.options.value.group);
      if (!d || !g) return d;
      return { type: 'FeatureCollection', features: d.features.filter((f) => g.includes(f.properties.group)) };
    });

    const overview = pointLayer(ctx, {
      data: shown,
      resources: [wd],
      name: 'wikidata',
      radius: ['interpolate', ['linear'], ['zoom'], 1, 2.6, 8, 4.5, 14, 7] as ExpressionSpecification,
      color: groupColor,
      stroke: { color: 'rgba(12, 14, 20, 0.8)', width: 0.8 },
      describe: (f: AnyFeature) => {
        const p = f.properties as ResourceProps;
        const g = RESOURCE_GROUPS[p.group];
        return {
          title: p.name,
          subtitle: `${p.cls || 'Vorkommen'} · ${g.label}`,
          color: g.color,
          icon: 'mine',
          facts: [
            { label: 'Art', value: p.cls || 'Vorkommen' },
            { label: 'Gruppe', value: g.label },
            ...(p.products ? [{ label: 'Rohstoffe', value: p.products }] : []),
          ],
          links: [{ label: 'Wikidata', url: `https://www.wikidata.org/wiki/${p.id}` }],
        };
      },
    });

    // the detail layer reports no status of its own (the overview carries count and age)
    const detail = pmtilesLayer({ ...ctx, status: () => {} }, {
      url: osmPmtilesUrl('resource'),
      sourceLayer: 'resource',
      name: 'osm',
      minZoom: DETAIL_ZOOM,
      radius: ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 2.4, 12, 3.6, 15, 6] as ExpressionSpecification,
      color: osmColor,
      stroke: { color: 'rgba(12, 14, 20, 0.8)', width: 0.7 },
      describe: (f: AnyFeature) => {
        const p = f.properties as { id: number; name?: string; kind?: string; resource?: string; words?: string; operator?: string };
        return {
          title: p.name || p.kind || 'Rohstoffstätte',
          subtitle: p.name && p.kind ? p.kind : 'OpenStreetMap',
          color: COLOR,
          icon: 'mine',
          facts: [
            ...(p.kind ? [{ label: 'Art', value: p.kind }] : []),
            ...(p.resource ? [{ label: 'Rohstoff', value: p.resource.replace(/[_;]/g, ', ') }] : []),
            ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
          ],
          links: [{ label: 'OpenStreetMap', url: `https://www.openstreetmap.org/node/${p.id}` }],
        };
      },
    });

    // regional detail 1: USGS MRDS for the USA, loaded per viewport from zoom 6 (public WFS, CORS open)
    const mrds = signal<MrdsCollection>(EMPTY_MRDS);
    const mrdsShown = computed<MrdsCollection>(() => {
      const g = multiValues(ctx.options.value.group);
      const d = mrds.value;
      return !g ? d : { type: 'FeatureCollection', features: d.features.filter((f) => g.includes(f.properties.group)) };
    });
    const ml = ctx.map.ml;
    let ctl: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastKey = '';
    const loadMrds = () => {
      if (ctx.signal.aborted) return;
      const b = ml.getBounds();
      if (ml.getZoom() < REGIONAL_ZOOM || b.getEast() < US_BOX.w || b.getWest() > US_BOX.e || b.getNorth() < US_BOX.s || b.getSouth() > US_BOX.n) {
        if (mrds.peek().features.length) mrds.value = EMPTY_MRDS;
        lastKey = '';
        return;
      }
      const r = (v: number, up: boolean) => (up ? Math.ceil(v * 4) / 4 : Math.floor(v * 4) / 4);
      const w = r(Math.max(b.getWest(), US_BOX.w), false), so = r(Math.max(b.getSouth(), US_BOX.s), false), e = r(Math.min(b.getEast(), US_BOX.e), true), n = r(Math.min(b.getNorth(), US_BOX.n), true);
      const key = `${w},${so},${e},${n}`;
      if (key === lastKey) return;
      lastKey = key;
      ctl?.abort();
      const my = (ctl = new AbortController());
      fetchRaw<string>(`${MRDS_WFS}&bbox=${w},${so},${e},${n}`, { format: 'text', timeout: 40_000, signal: my.signal })
        .then((res) => { if (!my.signal.aborted) mrds.value = mrdsSites(res.data); })
        .catch(() => { if (!my.signal.aborted) lastKey = ''; });
    };
    const onMove = () => { clearTimeout(timer); timer = setTimeout(loadMrds, 400); };
    ml.on('moveend', onMove);
    loadMrds();
    const regional = pointLayer({ ...ctx, status: () => {} }, {
      data: mrdsShown,
      name: 'mrds',
      minZoom: REGIONAL_ZOOM,
      radius: ['interpolate', ['linear'], ['zoom'], REGIONAL_ZOOM, 2.2, 10, 3.6, 14, 5.5] as ExpressionSpecification,
      color: groupColor,
      stroke: { color: 'rgba(12, 14, 20, 0.8)', width: 0.7 },
      describe: (f: AnyFeature) => {
        const p = f.properties as MrdsProps;
        const g = RESOURCE_GROUPS[p.group];
        return {
          title: p.name || (p.commodities ? `Fundstelle ${p.commodities}` : 'Rohstoff-Fundstelle'),
          subtitle: [p.commodities, p.status].filter(Boolean).join(' · ') || 'USGS MRDS',
          color: g.color,
          icon: 'mine',
          facts: [
            ...(p.commodities ? [{ label: 'Rohstoffe', value: p.commodities }] : []),
            ...(p.status ? [{ label: 'Status', value: p.status }] : []),
            { label: 'Gruppe', value: g.label },
            { label: 'Quelle', value: 'USGS Mineral Resources Data System (Public Domain)' },
          ],
          links: [{ label: 'USGS MRDS', url: p.url }],
        };
      },
    });

    // regional detail 2: Germany, BGR KOR250 as map image (only the tiles inside Germany are requested)
    const kor = rasterLayer({ ...ctx, status: () => {} }, {
      tiles: [KOR250], tileSize: 256, minzoom: REGIONAL_ZOOM, maxzoom: 18, bounds: [5.5, 47, 15.5, 55.2], name: 'kor250',
      attribution: 'Rohstoffe DE: © BGR, KOR250',
    });

    return { destroy() { clearTimeout(timer); ctl?.abort(); ml.off('moveend', onMove); kor.destroy(); regional.destroy(); detail.destroy(); overview.destroy(); } };
  },
});
