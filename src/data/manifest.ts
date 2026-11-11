// manifest.json of the buckets live/data/osm: { [key]: { updated, bytes, source, license } }, cached for 5 minutes.
import { computed, signal, type ReadonlySignal } from '@preact/signals';
import { BASE, MANIFEST_BUCKETS, bucketUrl, type Bucket } from './endpoints';
import { fetchJson } from './http';

export interface ManifestEntry { updated: string; bytes: number; source: string; license: string }
export type Manifest = Record<string, ManifestEntry>;

const TTL = 5 * 60_000;
const cache = new Map<Bucket, { at: number; data: Manifest }>();
const inflight = new Map<Bucket, Promise<Manifest | undefined>>();
const signals = new Map<Bucket, ReturnType<typeof signal<Manifest | undefined>>>();

const sig = (b: Bucket) => {
  let s = signals.get(b);
  if (!s) signals.set(b, (s = signal<Manifest | undefined>(cache.get(b)?.data)));
  return s;
};

export const hasManifest = (b: Bucket) => (MANIFEST_BUCKETS as readonly string[]).includes(b);

/** Loads (or returns the cached) manifest of a bucket. Resolves undefined when the bucket has none or it cannot be loaded. */
export function loadManifest(bucket: Bucket): Promise<Manifest | undefined> {
  if (!hasManifest(bucket)) return Promise.resolve(undefined);
  const hit = cache.get(bucket);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);
  let p = inflight.get(bucket);
  if (!p) {
    p = fetchJson<Manifest>(BASE[bucket] + 'manifest.json')
      .then((r) => {
        cache.set(bucket, { at: Date.now(), data: r.data });
        sig(bucket).value = r.data;
        return r.data;
      })
      .catch(() => hit?.data)
      .finally(() => inflight.delete(bucket));
    inflight.set(bucket, p);
  }
  return p;
}

export async function manifestEntry(bucket: Bucket, key: string): Promise<ManifestEntry | undefined> {
  return (await loadManifest(bucket))?.[key];
}

/** Reactive variant for the UI: starts loading on first read. */
export function manifestEntrySignal(bucket: Bucket, key: string): ReadonlySignal<ManifestEntry | undefined> {
  const s = sig(bucket);
  void loadManifest(bucket);
  return computed(() => s.value?.[key]);
}

export const manifestUrl = (bucket: Bucket) => bucketUrl(bucket, 'manifest.json');

/** Test hook. */
export const _resetManifestCache = () => {
  cache.clear();
  inflight.clear();
  signals.forEach((s) => (s.value = undefined));
};
