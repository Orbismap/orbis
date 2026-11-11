// GDACS event list (GeoJSON) -> slim points: type, alert level, period, severity text.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type GdacsType = 'TC' | 'FL' | 'VO' | 'DR' | 'WF' | 'EQ';
export type GdacsProps = {
  id: string;
  type: GdacsType;
  /** 0 green, 1 orange, 2 red */
  alert: 0 | 1 | 2;
  name: string;
  country: string;
  /** ms since epoch */
  from: number;
  to: number;
  /** GDACS severity sentence, e.g. "Orange impact for forestfire in 1568 ha" */
  text: string;
  /** severity value and unit: km/h (cyclone wind), ha (fire), km2 (drought), '' = none */
  sev: number;
  unit: string;
  url: string;
};
export type GdacsCollection = FeatureCollection<Point, GdacsProps>;

const TYPES = new Set(['TC', 'FL', 'VO', 'DR', 'WF', 'EQ']);

/** GDACS timestamps carry no zone and are UTC. */
const utc = (s: unknown): number => {
  if (typeof s !== 'string' || !s) return NaN;
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
};

export function gdacsEvents(raw: unknown): GdacsCollection {
  const features: Feature<Point, GdacsProps>[] = [];
  const list = (raw as { features?: { geometry?: { type?: string; coordinates?: number[] }; properties?: Record<string, any> }[] } | null)?.features; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!Array.isArray(list)) return { type: 'FeatureCollection', features };
  for (const f of list) {
    const p = f.properties;
    const c = f.geometry?.coordinates;
    if (!p || f.geometry?.type !== 'Point' || !c || c.length < 2 || !TYPES.has(p.eventtype)) continue;
    const level = String(p.alertlevel ?? 'Green').toLowerCase();
    const from = utc(p.fromdate);
    const to = utc(p.todate);
    if (!Number.isFinite(from)) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c[0]!, c[1]!] },
      properties: {
        id: `${p.eventtype}${p.eventid}`,
        type: p.eventtype,
        alert: level === 'red' ? 2 : level === 'orange' ? 1 : 0,
        name: String(p.name ?? p.eventname ?? '').replace(/\s+/g, ' ').trim(),
        country: String(p.country ?? '').replace(/\s+/g, ' ').trim(),
        from,
        to: Number.isFinite(to) ? to : from,
        text: String(p.severitydata?.severitytext ?? '').replace(/\s+/g, ' ').trim(),
        sev: Number(p.severitydata?.severity) || 0,
        unit: String(p.severitydata?.severityunit ?? ''),
        url: String(p.url?.report ?? ''),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
