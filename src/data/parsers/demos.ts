// demos.json (demonstrations.org: registered assemblies DE/AT/CH) -> slim points with epoch times.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type DemoProps = {
  id: string; name: string; start: number; end: number; country: string; city: string; place: string; topics: string; org: string; est: string;
  march: boolean; role: string; src: string; url: string; text: string; points: string;
};
export type DemoCollection = FeatureCollection<Point, DemoProps>;
export interface DemoData { built: number; features: DemoCollection }

const TZ = 'Europe/Berlin';
let fmt: Intl.DateTimeFormat | undefined;

/** Wall-clock ISO time of a place in Europe/Berlin -> epoch ms (the feed gives local times without offset). */
export function berlinToEpoch(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(iso);
  if (!m) return NaN;
  const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
  fmt ??= new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(fmt!.formatToParts(t).map((x) => [x.type, +x.value]));
    return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - t;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return t;
}

const ROLE: Record<string, string> = { start: 'Auftakt', waypoint: 'Zwischenkundgebung', rally: 'Kundgebung', end: 'Endkundgebung' };
const LATEST = 540 * 86_400_000; // entries further ahead are series with broken dates

interface RawEvent {
  n?: string; s?: string; e?: string; c?: string; city?: string; place?: string; lon?: number; lat?: number; r?: string; topics?: string[];
  org?: string; est?: string; march?: boolean; src?: string; u?: string; ds?: string; sd?: string; lc?: { a?: string; y?: string; r?: string }[];
}

export function demoEvents(raw: unknown, args?: { now?: number }): DemoData {
  const now = args?.now ?? Date.now();
  const features: Feature<Point, DemoProps>[] = [];
  const seen = new Set<string>();
  const doc = raw as { built?: string; events?: RawEvent[] } | null;
  for (const e of doc?.events ?? []) {
    if (!e.s || !Number.isFinite(e.lon) || !Number.isFinite(e.lat)) continue;
    const start = berlinToEpoch(e.s);
    if (!Number.isFinite(start) || start > now + LATEST) continue;
    let end = e.e ? berlinToEpoch(e.e) : NaN;
    if (!Number.isFinite(end) || end < start) end = start + 2 * 3_600_000; // missing or broken end
    const key = `${e.n}|${e.s}|${e.lon},${e.lat}`;
    if (seen.has(key)) continue;
    seen.add(key);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.lon!, e.lat!] },
      properties: {
        id: String(features.length),
        name: (e.n ?? e.sd ?? 'Versammlung').trim(),
        start, end,
        country: e.c ?? '', city: e.city ?? '', place: e.place ?? '',
        topics: (e.topics ?? []).join(', '),
        org: e.org ?? '', est: e.est ?? '', march: !!e.march,
        role: e.r ? (ROLE[e.r] ?? e.r) : '',
        src: /^https?:\/\//.test(e.src ?? '') ? e.src! : (e.src ?? ''),
        url: /^https?:\/\//.test(e.u ?? '') ? e.u! : '',
        text: (e.ds ?? '').slice(0, 700),
        points: (e.lc ?? []).map((l) => `${ROLE[l.r ?? ''] ?? l.r ?? 'Punkt'}: ${[l.a, l.y].filter(Boolean).join(', ')}`).join('\n'),
      },
    });
  }
  const built = doc?.built ? Date.parse(doc.built) : now;
  return { built: Number.isFinite(built) ? built : now, features: { type: 'FeatureCollection', features } };
}
