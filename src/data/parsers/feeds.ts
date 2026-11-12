// Registry of the vehicle feeds and the shared fetch with a short memo, so that the train layer and the local transport
// layer never request the same feed twice. Not a parser; lives here because layer folders may only contain layers.
import { bboxIntersects, type BBox } from '../../core/geo';
import { amtrakerFeed } from './feed-amtraker';
import { capmetroFeed } from './feed-capmetro';
import { ctaFeed } from './feed-cta';
import { digitrafficFeed } from './feed-digitraffic';
import { enturFeed } from './feed-entur';
import { hslFeed } from './feed-hsl';
import { malaysiaFeed } from './feed-malaysia';
import { mbtaFeed } from './feed-mbta';
import { metrotransitFeed } from './feed-metrotransit';
import { ovapiFeed } from './feed-ovapi';
import { septaFeed } from './feed-septa';
import { trafiklabFeed } from './feed-trafiklab';
import { translinkFeed } from './feed-translink';
import { ttcFeed } from './feed-ttc';
import { victoriaFeed } from './feed-victoria';
import type { VehicleFeed, VehicleFix } from './vehicles';

export const FEEDS: VehicleFeed[] = [
  digitrafficFeed, amtrakerFeed, enturFeed, mbtaFeed, septaFeed, metrotransitFeed, capmetroFeed, ttcFeed, hslFeed, ovapiFeed, translinkFeed,
  malaysiaFeed, victoriaFeed, ctaFeed, trafiklabFeed,
];
export const feedById = (id: string) => FEEDS.find((f) => f.id === id);

/** Feeds whose region meets the view; keyed feeds only with a key (`keys` maps key id -> value). */
export function feedsInView(view: BBox, ids: readonly string[], keys: (id: string) => string | undefined): VehicleFeed[] {
  return FEEDS.filter((f) => ids.includes(f.id) && (!f.key || keys(f.key)) && bboxIntersects(f.bbox, view));
}

const memo = new Map<string, { at: number; promise: Promise<VehicleFix[]> }>();

/** Loads a feed; a second caller within the feed's poll interval gets the same result. Whole-network feeds ignore the box. */
export function loadFeed(feed: VehicleFeed, bbox: BBox, key: string | undefined, signal: AbortSignal, now = Date.now()): Promise<VehicleFix[]> {
  const q = (v: number) => Math.round(v * 5) / 5;
  const id = feed.bounded ? `${feed.id}:${bbox.map(q).join(',')}` : feed.id;
  const hit = memo.get(id);
  if (hit && now - hit.at < feed.every * 0.8) return hit.promise;
  const promise = feed.load({ bbox, key, signal });
  memo.set(id, { at: now, promise });
  promise.catch(() => memo.delete(id));
  return promise;
}
