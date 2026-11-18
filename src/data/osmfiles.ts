// File names of the OSM PMTiles in the bucket `orbis-osm`. The data repo (collectors/osm-tiles.mjs) dates every file
// (`roofs-2026-11-18.pmtiles`), so that cached Range bytes of an old version never mix with a new one; the current names
// are in `meta.json` under `files` (format 8). Without it (older bucket, meta.json not reachable) the undated name is the answer.
import { bucketUrl } from './endpoints';

/** A PMTiles URL that may still be looked up. */
export type OsmUrl = string | Promise<string>;

/** meta.json has a cache lifetime of 1 h; a tab that stays open for long asks again, so it never meets a deleted file. */
const KEEP_MS = 10 * 60_000;
const TIMEOUT_MS = 15_000;

let cached: { at: number; files: Promise<Record<string, string>> } | undefined;

async function loadFiles(): Promise<Record<string, string>> {
  try {
    const res = await fetch(bucketUrl('osm', 'meta.json'), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return {};
    const files = ((await res.json()) as { files?: unknown } | null)?.files;
    if (!files || typeof files !== 'object') return {};
    return Object.fromEntries(Object.entries(files).filter((e): e is [string, string] => typeof e[1] === 'string' && /^[\w.-]+\.pmtiles$/.test(e[1])));
  } catch {
    return {};
  }
}

/** The current file names per set (`{ cctv: 'cctv-2026-11-18.pmtiles', … }`); empty when meta.json cannot be read. */
export function osmFiles(now = Date.now()): Promise<Record<string, string>> {
  if (!cached || now - cached.at > KEEP_MS) {
    const entry = { at: now, files: loadFiles() };
    cached = entry;
    // a failed read is not kept: the next layer asks again
    void entry.files.then((f) => { if (cached === entry && Object.keys(f).length === 0) cached = undefined; });
  }
  return cached.files;
}

/** Full URL of the PMTiles file of a set (`cctv`, `blitzer`, `alpr`, `webcam`, `wind`, `resource`, `trees`, `roofs`). */
export const osmPmtilesUrl = (set: string): Promise<string> => osmFiles().then((files) => bucketUrl('osm', files[set] ?? `${set}.pmtiles`));

/** For tests. */
export const resetOsmFiles = () => { cached = undefined; };
