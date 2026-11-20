// Single trees mapped in OpenStreetMap (natural=tree, 35 million points, monthly extract as PMTiles in the osm bucket): round
// dots sized by the tree's height, coloured by leaf type. Orbis Pro swaps them for 3D trees (same zoom range), like the power towers.
// The same file has a second layer `tree_lines` (tree rows and hedges as lines): only the channel reads it, Pro plants trees and
// bushes along the lines; the 2D map shows the single trees only.
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatNumber } from '../../core/format';
import { osmPmtilesUrl } from '../../data/osmfiles';
import { LEAF_CYCLES, LEAF_TYPES, buildTreeSamples, type RawTree, type RawTreeLine } from '../../data/parsers/trees';
import { treesChannel } from '../../ext/channels';
import type { AnyFeature } from '../../render/common';
import { pmtilesLayer } from '../../render/pmtiles';
import { defineLayer } from '../define';

const COLOR = '#4CAF6A';
const BROAD = '#5DB56F';
const NEEDLE = '#2F8F6B';
const UNKNOWN = '#7FBF7A';
/** The tiles exist at zoom 15 only: nothing to show below. Pro's 3D trees start at the same zoom, so the dots are never seen with Pro. */
const MIN_ZOOM = 15;
const PUBLISH_ZOOM = MIN_ZOOM;
/** Wait after new tiles or a camera move before querying the source (ms): one query per gesture, not per tile. */
const SCAN_DELAY_MS = 250;

const expr = (e: unknown) => e as ExpressionSpecification;
/** Crown radius in metres: from the height (default 9 m), between 1.5 and 7 m. */
const crown = ['max', 1.5, ['min', 7, ['*', 0.3, ['coalesce', ['get', 'height'], 9]]]];
/** Pixels per metre double with every zoom level: the dot keeps its real size (about 0.33 px per metre at zoom 15 and 50° N). */
const radius = expr(['interpolate', ['exponential', 2], ['zoom'], MIN_ZOOM, ['max', 1.2, ['*', 0.33, crown]], 22, ['*', 42, crown]]);
const color = expr(['match', ['get', 'leaf_type'], 'broadleaved', BROAD, 'needleleaved', NEEDLE, UNKNOWN]);

export default defineLayer({
  id: 'baeume',
  category: 'erde',
  title: 'Bäume',
  summary: 'Einzelne Bäume aus OpenStreetMap, ab Zoomstufe 15; mit Orbis Pro als 3D-Bäume',
  icon: 'leaf',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  minZoom: MIN_ZOOM,
  coverage: 'Welt, wo Bäume einzeln kartiert sind (vor allem Europa und Städte)',
  sources: [
    {
      name: 'OpenStreetMap-Mitwirkende, natural=tree, tree_row, hedge', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0',
      manifest: { bucket: 'osm', key: 'trees.pmtiles' },
    },
  ],
  legend: {
    type: 'classes',
    items: [
      { color: BROAD, label: 'Laubbaum' },
      { color: NEEDLE, label: 'Nadelbaum' },
      { color: UNKNOWN, label: 'Art nicht erfasst; Größe = Höhe' },
    ],
  },
  keywords: ['baum', 'bäume', 'baumkataster', 'tree', 'trees', 'wald', 'allee', 'park', 'laub', 'nadel', 'straßenbaum'],

  mount(ctx) {
    // while Orbis Pro draws 3D trees the dots disappear (data, cards and the channel keep working)
    const handle = pmtilesLayer(ctx, {
      url: osmPmtilesUrl('trees'),
      sourceLayer: 'trees',
      minZoom: MIN_ZOOM,
      radius,
      color,
      stroke: { color: 'rgba(10, 30, 20, 0.55)', width: 0.5 },
      hideWhen: treesChannel.presented,
      describe(f: AnyFeature) {
        const p = f.properties as { species?: string; height?: number; circumference?: number; leaf_type?: string; leaf_cycle?: string };
        const type = LEAF_TYPES[p.leaf_type as keyof typeof LEAF_TYPES];
        const cycle = LEAF_CYCLES[p.leaf_cycle as keyof typeof LEAF_CYCLES];
        const name = p.species?.trim();
        // the tiles carry no OSM ids: the link opens the map at the tree
        const [lng, lat] = f.geometry.type === 'Point' ? f.geometry.coordinates : [];
        return {
          title: name || type || 'Baum',
          subtitle: name && type ? type : 'Baum',
          color: COLOR,
          icon: 'leaf',
          facts: [
            ...(p.height ? [{ label: 'Höhe', value: `${formatNumber(p.height, 1)} m`, emphasis: true }] : []),
            ...(p.circumference ? [{ label: 'Stammumfang', value: `${formatNumber(p.circumference, 2)} m` }] : []),
            ...(type ? [{ label: 'Art', value: type }] : []),
            ...(cycle ? [{ label: 'Laub', value: cycle }] : []),
          ],
          links: typeof lng === 'number' && typeof lat === 'number' ? [{ label: 'OpenStreetMap', url: `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=20/${lat.toFixed(6)}/${lng.toFixed(6)}` }] : [],
        };
      },
    });

    // --- channel for extensions (Orbis Pro): the trees of the loaded tiles near the view ---
    const ml = ctx.map.ml;
    const src = `${ctx.id}-src`;
    let published = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scan = () => {
      timer = undefined;
      if (!ml.getSource(src) || !treesChannel.listening) return;
      if (ml.getZoom() < PUBLISH_ZOOM) {
        if (published) { published = false; treesChannel.reset(); }
        return;
      }
      // While tiles are loading the query sees few or no trees: publishing that would switch Pro's 3D trees off and the
      // 2D dots on for a moment (flicker). The source fires again when it has loaded, which scans again.
      if (!ml.isSourceLoaded(src)) return;
      const raw: RawTree[] = [];
      for (const f of ml.querySourceFeatures(src, { sourceLayer: 'trees' })) {
        const g = f.geometry;
        if (g.type !== 'Point') continue;
        const [lng, lat] = g.coordinates;
        if (typeof lng !== 'number' || typeof lat !== 'number') continue;
        raw.push({ lng, lat, props: (f.properties ?? {}) as Record<string, unknown> });
      }
      const lines: RawTreeLine[] = [];
      for (const f of ml.querySourceFeatures(src, { sourceLayer: 'tree_lines' })) {
        const g = f.geometry;
        const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
        for (const coords of parts) lines.push({ coords: coords.map((c) => [c[0]!, c[1]!] as [number, number]), props: (f.properties ?? {}) as Record<string, unknown> });
      }
      const b = ml.getBounds();
      const c = ml.getCenter();
      const samples = buildTreeSamples(raw, lines, { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth(), centreLng: c.lng, centreLat: c.lat });
      published = true;
      treesChannel.publish(() => samples);
    };
    const schedule = () => {
      if (timer === undefined) timer = setTimeout(scan, SCAN_DELAY_MS);
    };
    const onSource = (e: { sourceId?: string }) => { if (e.sourceId === src) schedule(); };
    ml.on('sourcedata', onSource as never);
    ml.on('moveend', schedule);
    const stopWatching = treesChannel.onListener(schedule);
    schedule();

    return {
      destroy() {
        clearTimeout(timer);
        stopWatching();
        ml.off('sourcedata', onSource as never);
        ml.off('moveend', schedule);
        treesChannel.reset();
        handle.destroy();
      },
    };
  },
});
