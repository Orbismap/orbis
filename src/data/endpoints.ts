// Bucket hosts. Override per .env (VITE_LIVE_BASE …); all buckets answer with CORS "*".
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const slash = (v: string | undefined, fallback: string) => {
  const s = v && v.trim() ? v.trim() : fallback;
  return s.endsWith('/') ? s : s + '/';
};

export const BASE = {
  live: slash(env.VITE_LIVE_BASE, 'https://orbis-live.maltee.dev/'), // minute snapshots (quakes, GDACS, FIRMS, TLE …)
  data: slash(env.VITE_DATA_BASE, 'https://orbis-data.maltee.dev/'), // daily/weekly (volcanoes, plants, cables, cams, radio …)
  osm: slash(env.VITE_OSM_BASE, 'https://orbis-osm.maltee.dev/'), // PMTiles (cctv, blitzer, alpr, webcam, wind, resource, netz-* …) + heat/
  wetter: slash(env.VITE_WETTER_BASE, 'https://orbis-wetter.maltee.dev/'), // ICON fields (OWX), v1/latest.json
  assets: slash(env.VITE_ASSETS_BASE, 'https://orbis-assets.maltee.dev/'),
} as const;

export type Bucket = keyof typeof BASE;
export const bucketUrl = (b: Bucket, key: string) => BASE[b] + key.replace(/^\//, '');

/** Buckets that publish a manifest.json. */
export const MANIFEST_BUCKETS = ['live', 'data', 'osm'] as const satisfies readonly Bucket[];

/** CORS proxy (Cloudflare worker of Orbismap/data) for sources that send no CORS headers. Host whitelist is server side. */
export const PROXY = (env.VITE_PROXY_URL && env.VITE_PROXY_URL.trim()) || 'https://orbis.malte9799.workers.dev/';
/** Routes a URL through the proxy: `PROXY?url=<encoded>`. */
export const proxied = (url: string): string => `${PROXY}${PROXY.includes('?') ? '&' : '?'}url=${encodeURIComponent(url)}`;
