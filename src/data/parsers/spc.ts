// NOAA SPC local storm reports (today.csv / yesterday.csv: three CSV blocks for tornado, wind and hail in one file).
import type { Feature, FeatureCollection, Point } from 'geojson';

export type SpcKind = 'tornado' | 'wind' | 'hail';
export type SpcProps = {
  id: string;
  kind: SpcKind;
  /** ms since epoch (UTC) */
  time: number;
  /** tornado: F/EF scale or ''; wind: mph (0 = unknown estimated); hail: hundredths of an inch */
  value: number;
  scale: string;
  location: string;
  county: string;
  state: string;
  comments: string;
  /** size class for the map: 1 small .. 3 large */
  rank: number;
};
export type SpcCollection = FeatureCollection<Point, SpcProps>;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The SPC report day runs 12 UTC to 12 UTC; start (ms) of the report day that `now` falls in. */
export const reportDayStart = (now: number): number => Math.floor((now - 12 * HOUR) / DAY) * DAY + 12 * HOUR;

/** Splits a quoted-free CSV row; the comment (last field) may contain commas. */
function row(line: string): string[] {
  const c = line.split(',');
  return c.length > 8 ? [...c.slice(0, 7), c.slice(7).join(',')] : c;
}

/**
 * Parses one SPC file. args: { dayStart } start of the report day of that file (ms, see reportDayStart);
 * report times HHMM >= 1200 belong to that calendar day, earlier ones to the next.
 */
export function spcReports(text: unknown, args: { dayStart: number }): SpcCollection {
  const features: Feature<Point, SpcProps>[] = [];
  let kind: SpcKind | undefined;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (line.startsWith('Time,')) {
      kind = line.includes('F_Scale') ? 'tornado' : line.includes('Speed') ? 'wind' : line.includes('Size') ? 'hail' : undefined;
      continue;
    }
    if (!kind) continue;
    const [hhmm, val, location, county, state, lat, lon, comments = ''] = row(line);
    const la = parseFloat(lat ?? '');
    const lo = parseFloat(lon ?? '');
    if (!Number.isFinite(la) || !Number.isFinite(lo) || !/^\d{4}$/.test(hhmm ?? '')) continue;
    const minutes = Number(hhmm!.slice(0, 2)) * 60 + Number(hhmm!.slice(2));
    const time = args.dayStart + (((minutes - 720) % 1440) + 1440) % 1440 * 60_000;
    const num = Number(val);
    const value = kind === 'tornado' ? 0 : Number.isFinite(num) ? num : 0;
    const scale = kind === 'tornado' && val && val !== 'UNK' ? val! : '';
    const rank = kind === 'tornado' ? 3 : kind === 'hail' ? (value >= 200 ? 3 : value >= 100 ? 2 : 1) : value >= 75 ? 3 : value >= 60 ? 2 : 1;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lo, la] },
      properties: {
        id: `spc:${kind}:${time}:${lo.toFixed(2)},${la.toFixed(2)}`,
        kind, time, value, scale, rank,
        location: location ?? '', county: county ?? '', state: state ?? '',
        comments: comments.replace(/^"|"$/g, '').trim().slice(0, 400),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
