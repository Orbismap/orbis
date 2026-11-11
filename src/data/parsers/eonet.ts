// NASA EONET open events -> one point per event at its latest position.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type EonetProps = {
  id: string;
  /** EONET category id: wildfires, severeStorms, seaLakeIce, volcanoes, floods, drought, ... */
  cat: string;
  title: string;
  /** date of the latest position, ms since epoch */
  t: number;
  /** first date of the event */
  t0: number;
  src: string;
  url: string;
  mag: number | null;
  unit: string;
  /** number of reported positions */
  n: number;
};
export type EonetCollection = FeatureCollection<Point, EonetProps>;

interface RawEvent {
  id?: string;
  title?: string;
  link?: string;
  categories?: { id?: string }[];
  sources?: { id?: string; url?: string }[];
  geometry?: { date?: string; type?: string; coordinates?: number[]; magnitudeValue?: number | null; magnitudeUnit?: string | null }[];
}

export function eonetEvents(raw: unknown): EonetCollection {
  const features: Feature<Point, EonetProps>[] = [];
  const list = (raw as { events?: RawEvent[] } | null)?.events;
  if (!Array.isArray(list)) return { type: 'FeatureCollection', features };
  for (const ev of list) {
    const cat = ev.categories?.[0]?.id;
    if (!ev.id || !cat || cat === 'earthquakes') continue; // USGS/EMSC are the better quake sources
    const pts = (ev.geometry ?? []).filter((g) => g.type === 'Point' && g.coordinates && g.coordinates.length >= 2 && g.date).sort((a, b) => a.date!.localeCompare(b.date!));
    const last = pts[pts.length - 1];
    if (!last) continue;
    const src = ev.sources?.[0];
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [last.coordinates![0]!, last.coordinates![1]!] },
      properties: {
        id: ev.id,
        cat,
        title: ev.title ?? 'Ereignis',
        t: Date.parse(last.date!),
        t0: Date.parse(pts[0]!.date!),
        src: src?.id ?? 'EONET',
        url: src?.url ?? ev.link ?? `https://eonet.gsfc.nasa.gov/api/v3/events/${ev.id}`,
        mag: typeof last.magnitudeValue === 'number' ? last.magnitudeValue : null,
        unit: last.magnitudeUnit ?? '',
        n: pts.length,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
