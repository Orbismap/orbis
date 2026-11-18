// Live webcams, drawn with the shared camera look (render/cameras.ts). World overview from cams/world.json (positions),
// the regional feeds (traffic and weather cameras with image or HLS stream) load once their region is in view, the
// OpenStreetMap webcams (webcam.pmtiles, 10,008 objects, thinned tiles from zoom 0) carry cards from the world view on.
import { computed, effect, signal } from '@preact/signals';
import type { FeatureCollection, Point } from 'geojson';
import { bucketUrl } from '../../data/endpoints';
import { osmPmtilesUrl } from '../../data/osmfiles';
import type { WebcamCollection, WebcamProps } from '../../data/parsers/webcams';
import type { Resource } from '../../data/resource';
import { KEYED_FEEDS, createKeyedFeeds } from '../../data/parsers/webcamkeys-feeds';
import { applyCamdir } from '../../data/parsers/webcamkeys';
import { cameraLayer, directionFact, osmNodeLink } from '../../render/cameras';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';
import type { InspectCard } from '../types';

const COLOR = '#19C7B0';
const FEED_ZOOM = 5;
const IMAGE_REFRESH = 60_000; // ms
const CAMDIR_URL = ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_CAMDIR_URL ?? 'https://orbis-cams.malte9799.workers.dev').replace(/\/+$/, '');

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


function media(p: WebcamProps): InspectCard['media'] {
  if (p.hls) return { type: 'hls', url: p.hls, poster: p.image || undefined };
  if (p.image) return { type: 'image', url: p.image, refresh: IMAGE_REFRESH };
  if (p.video) return { type: 'video', url: p.video };
  return undefined;
}

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
    { name: 'Kamera-Verzeichnis (korrigierte Blickrichtungen, eigener Worker)', url: CAMDIR_URL, license: 'Orbis-Community, frei lesbar' },
    // keyed feeds: inactive without the user's key (Boost), then loaded live from the portal for the area in view
    ...KEYED_FEEDS.map((f) => f.source),
  ],
  keys: KEYED_FEEDS.map((f) => ({ id: f.key, required: false })),
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Webcam (Live-Bild, Stream oder Link)' }] },
  keywords: ['kamera', 'webcam', 'verkehr', 'live', 'cam', 'traffic', 'stream', 'bild'],

  mount(ctx) {
    const ml = ctx.map.ml;

    // 1. world overview: positions only, no cards
    const world = ctx.resource<FeatureCollection<Point>>({ key: 'data:cams-world', url: bucketUrl('data', 'cams/world.json'), parse: 'webcamPoints', timeout: 40_000 });

    // corrected viewing directions of the camera directory (worker); a failure only means "no corrections"
    const camdir = ctx.resource<Record<string, number>>({ key: 'camdir:dirs', url: `${CAMDIR_URL}/dirs`, parse: 'camdirMap', timeout: 20_000 });

    // keyed feeds (Windy, 511 portals, OHGO, ...): only with the user's key
    const keyed = createKeyedFeeds((id) => ctx.key(id).value, () => camdir.data.value);
    const refreshKeyed = () => { const b = ml.getBounds(); keyed.refresh({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(), zoom: ml.getZoom() }); };
    let keyedTimer: ReturnType<typeof setTimeout> | undefined;
    const onKeyedMove = () => { clearTimeout(keyedTimer); keyedTimer = setTimeout(refreshKeyed, 500); };
    ml.on('moveend', onKeyedMove);
    const keyChange = effect(() => { KEYED_FEEDS.forEach((f) => ctx.key(f.key).value); refreshKeyed(); });
    const stopCamdirRepublish = effect(() => { camdir.data.value; refreshKeyed(); });

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
      const dirs = camdir.data.value;
      const features = [
        ...active.value.flatMap((id) => (dirs ? applyCamdir(feeds.get(id)?.data.value ?? { type: 'FeatureCollection', features: [] }, dirs).features : feeds.get(id)?.data.value?.features ?? [])),
        ...(keyed.data.value?.features ?? []),
      ];
      return { type: 'FeatureCollection', features };
    });

    // status note: which keyed feeds work, which fail and how many wait for a key
    const note = computed(() => {
      const on = KEYED_FEEDS.filter((f) => ctx.key(f.key).value?.trim());
      const errs = Object.entries(keyed.errors.value);
      const parts = [
        on.length ? `Mit Ihrem Schlüssel aktiv: ${on.map((f) => f.label.replace(/ \(.*\)$/, '')).join(', ')}` : '',
        errs.length ? `Fehler: ${errs.map(([id, m]) => `${KEYED_FEEDS.find((f) => f.id === id)?.label.replace(/ \(.*\)$/, '') ?? id}: ${m}`).join('; ')}` : '',
        `${KEYED_FEEDS.length - on.length} weitere Feeds brauchen einen Schlüssel (Boost)`,
      ].filter(Boolean);
      return parts.join(' · ');
    });
    const withNote = { ...ctx, status: (s: Parameters<typeof ctx.status>[0]) => ctx.status(s.state === 'ready' || s.state === 'empty' ? { ...s, note: [s.note, note.peek()].filter(Boolean).join(' · ') } : s) };
    const stopNote = effect(() => { note.value; });

    const kit = cameraLayer(withNote, {
      color: COLOR,
      resources: [world],
      count: computed(() => world.data.value?.features.length),
      // world.json positions are rounded (4 decimals, ~7 m): from zoom 13 on the regional feeds / OSM show the exact ones
      overview: { name: 'overview', maxZoom: 13, data: { kind: 'geojson', data: world.data } },
      detail: [
        {
          name: 'feeds',
          data: { kind: 'geojson', data: merged },
          minZoom: FEED_ZOOM,
          describe: (f: AnyFeature) => {
            const p = f.properties as WebcamProps;
            const m = media(p);
            return {
              title: p.title,
              subtitle: p.subtitle || 'Webcam',
              facts: [
                ...(p.source ? [{ label: 'Quelle', value: p.source }] : []),
                ...directionFact(p.dir).map((d) => ((f.properties as { dirset?: boolean }).dirset ? { ...d, value: `${d.value}, korrigiert (Kamera-Verzeichnis)` } : d)),
                ...(!m ? [{ label: 'Hinweis', value: 'Kein Live-Bild eingebunden, nur Link' }] : []),
              ],
              media: m,
              links: p.url ? [{ label: 'Kamera öffnen', url: p.url }] : [],
            };
          },
        },
        {
          // OpenStreetMap webcams: thinned from zoom 0, full from zoom 5
          name: 'osm',
          data: { kind: 'pmtiles', url: osmPmtilesUrl('webcam'), sourceLayer: 'webcam', attribution: '© OpenStreetMap-Mitwirkende (ODbL)' },
          describe: (f: AnyFeature) => {
            const p = f.properties as { id: number; name?: string; operator?: string; link?: string; dir?: number; panning?: number };
            const link = /^https?:\/\//.test(p.link ?? '') ? p.link! : '';
            const isImage = /\.(jpe?g|png|gif|webp)(\?|$)/i.test(link) && link.startsWith('https://');
            return {
              title: p.name || 'Webcam',
              subtitle: 'Webcam aus OpenStreetMap',
              facts: [
                ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
                ...directionFact(p.dir),
                ...(p.panning ? [{ label: 'Bauart', value: 'schwenkbar' }] : []),
              ],
              media: isImage ? { type: 'image', url: link, refresh: IMAGE_REFRESH } : undefined,
              links: [...(link ? [{ label: 'Webseite der Kamera', url: link }] : []), ...osmNodeLink(p.id)],
            };
          },
        },
      ],
    });

    return {
      destroy() {
        ml.off('moveend', refreshFeeds);
        ml.off('moveend', onKeyedMove);
        clearTimeout(keyedTimer);
        keyChange(); stopCamdirRepublish(); stopNote();
        keyed.destroy();
        kit.destroy();
      },
    };
  },
});
