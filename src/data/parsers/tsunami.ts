// NOAA tsunami.gov Atom bulletin (PAAQ = Alaska NTWC, PHEB = Pacific PTWC) -> epicentre points.
// Regex based on purpose: DOMParser does not exist in workers.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type TsunamiProps = {
  id: string;
  /** 0 information (no threat), 1 advisory, 2 watch, 3 warning */
  level: 0 | 1 | 2 | 3;
  category: string;
  region: string;
  /** preliminary magnitude (0 = unknown) and its type, e.g. "Ml" */
  mag: number;
  magType: string;
  /** issue time, ms since epoch */
  t: number;
  /** warning centre */
  centre: string;
  note: string;
  url: string;
};
export type TsunamiCollection = FeatureCollection<Point, TsunamiProps>;

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const tag = (xml: string, name: string) => new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml)?.[1];
/** Value of `<strong>Label:</strong> value` up to the next tag boundary (`<br/>`, `<b>`, `<strong>`). */
const field = (html: string, label: string) =>
  new RegExp(`<strong>\\s*${label}\\s*:?\\s*</strong>([\\s\\S]*?)(?:<br\\s*/?>|<strong>|<b>|$)`, 'i').exec(html)?.[1];

const levelOf = (cat: string): 0 | 1 | 2 | 3 => {
  const c = cat.toLowerCase();
  return c.includes('warning') ? 3 : c.includes('watch') ? 2 : c.includes('advisory') || c.includes('threat') ? 1 : 0;
};

export function tsunamiBulletins(raw: unknown): TsunamiCollection {
  const features: Feature<Point, TsunamiProps>[] = [];
  const xml = typeof raw === 'string' ? raw : '';
  const centre = text(tag(xml.replace(/<entry[\s\S]*?<\/entry>/gi, ''), 'name') ?? '');
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)) {
    const e = m[1]!;
    const lat = Number(tag(e, 'geo:lat'));
    const lon = Number(tag(e, 'geo:long'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const summary = tag(e, 'summary') ?? '';
    const category = text(field(summary, 'Category') ?? 'Information');
    const t = Date.parse(text(tag(e, 'updated') ?? ''));
    const magText = text(field(summary, 'Preliminary Magnitude') ?? '');
    const mm = /([\d.]+)\s*\(?([A-Za-z]*)\)?/.exec(magText);
    const bulletin = /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i.exec(e)?.[1] ?? /href="(https:\/\/www\.tsunami\.gov\/events\/[^"]+)"/i.exec(summary)?.[1] ?? 'https://www.tsunami.gov/';
    const note = text((/<b>Note:<\/b>([\s\S]*?)<br/i.exec(summary)?.[1] ?? '').replace(/^\s*\*\s*/, ''));
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        id: text(tag(e, 'id') ?? '') || `${t}:${lat}:${lon}`,
        level: levelOf(category),
        category,
        region: text(field(summary, 'Affected Region') ?? tag(e, 'title') ?? 'Unbekannte Region'),
        mag: mm ? Number(mm[1]) || 0 : 0,
        magType: mm?.[2] ?? '',
        t: Number.isFinite(t) ? t : 0,
        centre,
        note,
        url: bulletin.trim(),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
