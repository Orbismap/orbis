// Live webcams. World overview from cams/world.json (positions), the regional feeds (traffic and weather cameras with
// image or HLS stream) load once their region is in view, OpenStreetMap webcams (webcam.pmtiles) from zoom 10.
import { computed, effect, signal } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { formatInt } from '../../core/format';
import { bucketUrl } from '../../data/endpoints';
import type { WebcamCollection, WebcamProps } from '../../data/parsers/webcams';
import type { Resource } from '../../data/resource';
import { pmtilesLayer } from '../../render/pmtiles';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';
import type { InspectCard } from '../types';

const COLOR = '#19C7B0';
const FEED_ZOOM = 5;
const OSM_ZOOM = 10;
const IMAGE_REFRESH = 60_000; // ms

/**
 * West, south, east, north of every feed in the data bucket (measured from the published files, Georgia corrected).
 * Feeds listed in `meta.json` but missing here (or not yet built, 404) are not loaded.
 */
const FEEDS: Record<string, [number, number, number, number]> = {
  '511.alberta.ca': [-120, 49.1, -110, 59.9], '511on.ca': [-95.1, 42.1, -74.4, 51.5], alertca: [-124.3, 32.6, -109.7, 43.1],
  austin: [-97.9, 30.1, -97.6, 30.5], br: [-91.6, 30.2, -90.8, 30.5], calgary: [-114.2, 50.9, -113.9, 51.2], caltrans: [-124.2, 32.6, -114.6, 42],
  cat: [0.5, 41.3, 2.3, 42.5], deldot: [-75.8, 38.5, -75.1, 39.8], dgt: [-9, 35.9, 3.2, 43.6], drivebc: [-132, 48.4, -114.7, 60],
  ga: [-85.7, 30.3, -80.7, 35.1], ia: [-96.5, 40.4, -90.2, 43.4], 'ie-donegal': [-9.5, 51.9, -6.1, 55.1], il: [-91.4, 37.8, -87.5, 42.5],
  is: [-23.9, 63.5, -13.9, 66.3], kingcounty: [-122.4, 47.2, -121.8, 47.8], ky: [-88.7, 36.6, -82.5, 39.1], md: [-79.5, 38.1, -75.1, 39.7],
  mi: [-86.7, 41.8, -82.4, 46.3], mo: [-95, 36.2, -89.5, 39.9], 'nl-ca': [-66.8, 46.7, -52.9, 53.6], nps: [-156.7, 19.4, -68, 63.7],
  nsw: [144.7, -36.4, 153.6, -28.2], nyc: [-74.2, 40.5, -73.7, 40.9], nz: [168.7, -45.9, 176.9, -36.4], or: [-124.5, 41.4, -116.8, 46.9],
  sk: [-110, 49.1, -102, 59.6], tfl: [-0.5, 51.3, 0.2, 51.7], vegvesen: [5, 58.1, 31, 71.2], wsdot: [-124.3, 45.3, -117.1, 49], yt: [-141, 59.8, -128.3, 66.4],
};

const radius = ['interpolate', ['linear'], ['zoom'], FEED_ZOOM, 3, 9, 4.5, 13, 7] as ExpressionSpecification;
const strokeColor = 'rgba(4, 28, 26, 0.9)';

function media(p: WebcamProps): InspectCard['media'] {
  if (p.hls) return { type: 'hls', url: p.hls, poster: p.image || undefined };
  if (p.image) return { type: 'image', url: p.image, refresh: IMAGE_REFRESH };
  if (p.video) return { type: 'video', url: p.video };
  return undefined;
}

const compass = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];

export default defineLayer({
  id: 'webcams',
  category: 'medien',
  title: 'Webcams',
  summary: 'Live-Bilder von Verkehrs- und Wetterkameras, Übersicht weltweit, Bilder ab Zoomstufe 5',
  icon: 'camera',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  sources: [
    { name: 'Kamera-Feeds von Straßenbehörden und Parkverwaltungen (Positionen täglich gespiegelt, Bilder live)', url: 'https://github.com/Orbismap/data', license: 'je Feed, siehe Quellenangabe in der Karte', manifest: { bucket: 'data', key: 'cams/world.json' } },
    { name: 'OpenStreetMap-Mitwirkende', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', manifest: { bucket: 'osm', key: 'webcam.pmtiles' } },
  ],
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Kamera mit Bild' }, { color: '#9AD7CF', label: 'Weitere Kamera (Übersicht, OSM)' }] },
  keywords: ['kamera', 'webcam', 'verkehr', 'live', 'cam', 'traffic', 'stream', 'bild'],

  mount(ctx) {
    const ml = ctx.map.ml;

    // 1. world overview: small dots without picking, drawn under everything of this layer
    const world = ctx.resource<FeatureCollection<Point>>({ key: 'data:cams-world', url: bucketUrl('data', 'cams/world.json'), parse: 'webcamPoints', timeout: 40_000 });
    const overviewSrc = `${ctx.id}.overview-src`;
    const overviewLayer = `${ctx.id}.overview-dots`;
    ctx.map.addSource(overviewSrc, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    ctx.map.addLayer({
      id: overviewLayer, type: 'circle', source: overviewSrc,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 1.1, 6, 1.8, 12, 3], 'circle-color': '#9AD7CF', 'circle-opacity': 0.55 },
    }, 'points');
    const stopOverview = effect(() => {
      const d = world.data.value;
      (ml.getSource(overviewSrc) as { setData(d: unknown): void } | undefined)?.setData(d ?? { type: 'FeatureCollection', features: [] });
    });
    const stopOpacity = effect(() => { if (ml.getLayer(overviewLayer)) ml.setPaintProperty(overviewLayer, 'circle-opacity', 0.55 * ctx.opacity.value); });

    // 2. regional feeds, lazily by viewport
    const active = signal<string[]>([]);
    const feeds = new Map<string, Resource<WebcamCollection>>();
    const refreshFeeds = () => {
      if (ctx.signal.aborted || ml.getZoom() < FEED_ZOOM) return;
      const b = ml.getBounds();
      const [w, s, e, n] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      let changed = false;
      for (const [id, [fw, fs, fe, fn]] of Object.entries(FEEDS)) {
        if (feeds.has(id) || fe < w || fw > e || fn < s || fs > n) continue;
        feeds.set(id, ctx.resource<WebcamCollection>({ key: `data:cams-${id}`, url: bucketUrl('data', `cams/${id}.json`), parse: 'webcamFeed', timeout: 40_000 }));
        changed = true;
      }
      if (changed) active.value = [...feeds.keys()];
    };
    ml.on('moveend', refreshFeeds);
    refreshFeeds();

    const merged = computed<WebcamCollection | undefined>(() => {
      if (!world.data.value) return undefined; // loading until the overview is there
      const features = active.value.flatMap((id) => feeds.get(id)?.data.value?.features ?? []);
      return { type: 'FeatureCollection', features };
    });
    const loaded = computed(() => (merged.value?.features.length ?? 0));

    const feedLayer = pointLayer(ctx, {
      data: merged,
      resources: [world],
      name: 'feeds',
      minZoom: FEED_ZOOM,
      radius,
      color: ['case', ['==', ['get', 'kind'], 'signed'], '#9AD7CF', COLOR] as ExpressionSpecification,
      stroke: { color: strokeColor, width: 1 },
      count: computed(() => (world.data.value?.features.length ?? 0) || loaded.value),
      describe: (f: AnyFeature) => {
        const p = f.properties as WebcamProps;
        const m = media(p);
        return {
          title: p.title,
          subtitle: p.subtitle || 'Webcam',
          color: COLOR,
          icon: 'camera',
          facts: [
            ...(p.source ? [{ label: 'Quelle', value: p.source }] : []),
            ...(p.dir >= 0 ? [{ label: 'Blickrichtung', value: `${formatInt(p.dir)}° (${compass[Math.round(p.dir / 45) % 8]})` }] : []),
            ...(!m ? [{ label: 'Hinweis', value: 'Kein Live-Bild eingebunden, nur Link' }] : []),
          ],
          media: m,
          links: p.url ? [{ label: 'Kamera öffnen', url: p.url }] : [],
        };
      },
    });

    // 3. OpenStreetMap webcams at street level; the detail layer reports no status of its own
    const osm = pmtilesLayer({ ...ctx, status: () => {} }, {
      url: bucketUrl('osm', 'webcam.pmtiles'),
      sourceLayer: 'webcam',
      name: 'osm',
      minZoom: OSM_ZOOM,
      radius: ['interpolate', ['linear'], ['zoom'], OSM_ZOOM, 3, 14, 6] as ExpressionSpecification,
      color: '#9AD7CF',
      stroke: { color: strokeColor, width: 1 },
      describe: (f: AnyFeature) => {
        const p = f.properties as { id: number; name?: string; operator?: string; link?: string; dir?: number; panning?: number };
        const link = /^https?:\/\//.test(p.link ?? '') ? p.link! : '';
        const isImage = /\.(jpe?g|png|gif|webp)(\?|$)/i.test(link) && link.startsWith('https://');
        return {
          title: p.name || 'Webcam',
          subtitle: 'Webcam aus OpenStreetMap',
          color: COLOR,
          icon: 'camera',
          facts: [
            ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
            ...(p.dir != null && p.dir >= 0 ? [{ label: 'Blickrichtung', value: `${formatInt(p.dir)}° (${compass[Math.round(p.dir / 45) % 8]})` }] : []),
            ...(p.panning ? [{ label: 'Bauart', value: 'schwenkbar' }] : []),
          ],
          media: isImage ? { type: 'image', url: link, refresh: IMAGE_REFRESH } : undefined,
          links: [...(link ? [{ label: 'Webseite der Kamera', url: link }] : []), { label: 'OpenStreetMap', url: `https://www.openstreetmap.org/node/${p.id}` }],
        };
      },
    });

    return {
      destroy() {
        ml.off('moveend', refreshFeeds);
        stopOverview();
        stopOpacity();
        osm.destroy();
        feedLayer.destroy();
        ctx.map.remove({ layers: [overviewLayer], sources: [overviewSrc] });
      },
    };
  },
});
