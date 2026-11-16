// Where the PMTiles files of "Orbis Karte" live (built by .github/workflows/karte-data.yml, tools/vector-basemap/README.md).
// Production: the osm bucket, folder karte/. `pnpm dev` uses public/data/karte/ (local build output) unless VITE_KARTE_DATA_BASE says otherwise.
import { BASE } from '../../data/endpoints';

const env = (import.meta as { env?: Record<string, string | boolean | undefined> }).env ?? {};

export type KarteFile = 'overlay' | 'labels' | 'landcover-vec' | 'landcover-hi';

function base(): string {
  const o = typeof env.VITE_KARTE_DATA_BASE === 'string' ? env.VITE_KARTE_DATA_BASE.trim() : '';
  if (o) return o.endsWith('/') ? o : o + '/';
  if (env.DEV) return `${env.BASE_URL ?? '/'}data/karte/`;
  return `${BASE.osm}karte/`;
}

/** `pmtiles://` source URL of one file. */
export function karteDataUrl(file: KarteFile): string {
  const url = new URL(`${base()}${file}.pmtiles`, globalThis.location?.href ?? 'http://localhost/').href;
  return `pmtiles://${url}`;
}
