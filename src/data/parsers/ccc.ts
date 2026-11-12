// ccc-us.json (Crowd Counting Consortium, CC0) -> slim points with epoch day, size estimate and text fields for the card.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type ProtestProps = {
  id: string; t: number; title: string; ty: string; city: string; st: string; s: number; slo: number; shi: number; sb: string; is: string; ar: number;
  so: string; so2: string; cl: string; pl: string; dmg: string; pi: string; poi: string; pd: string; pod: string;
};
export type ProtestCollection = FeatureCollection<Point, ProtestProps> & { built?: string; lastDay?: number };

interface Raw { d?: string; t?: string; ty?: string; city?: string; st?: string; lon?: number; lat?: number; s?: number; slo?: number; shi?: number; sb?: string; is?: string; ar?: number; so?: string; so2?: string; cl?: string; pl?: string; dmg?: string; pi?: string; poi?: string; pd?: string; pod?: string }

const clip = (s: string | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s ?? '');

export function cccEvents(raw: unknown): ProtestCollection {
  const doc = raw as { built?: string; events?: Raw[] } | null;
  const features: Feature<Point, ProtestProps>[] = [];
  let last = 0;
  for (const e of doc?.events ?? []) {
    if (!e.d || !Number.isFinite(e.lon) || !Number.isFinite(e.lat)) continue;
    const t = Date.parse(`${e.d}T12:00:00Z`);
    if (!Number.isFinite(t)) continue;
    if (t > last) last = t;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.lon!, e.lat!] },
      properties: {
        id: String(features.length), t, title: e.t ?? '', ty: e.ty ?? '', city: e.city ?? '', st: e.st ?? '', s: e.s ?? 0, slo: e.slo ?? 0, shi: e.shi ?? 0,
        sb: clip(e.sb, 80), is: clip(e.is, 120), ar: e.ar ?? -1, so: e.so ?? '', so2: e.so2 ?? '', cl: clip(e.cl, 400), pl: clip(e.pl, 300),
        dmg: clip(e.dmg, 160), pi: clip(e.pi, 160), poi: clip(e.poi, 160), pd: clip(e.pd, 160), pod: clip(e.pod, 160),
      },
    });
  }
  return { type: 'FeatureCollection', features, built: doc?.built, lastDay: last };
}
