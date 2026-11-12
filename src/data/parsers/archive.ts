// Archive Genocide geolocation data (archivegenocide.com/geolocation/data/*.json, read through the proxy).
// pins.json rows: [id, lon, lat, level, categoryIndex, dayIndex, ...]; dots.json: approximate places; external.json: external placements.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type ArchivePinProps = { id: string; clip: number; lvl: number; ci: number; day: number; kind: 'pin' | 'ext'; title: string; srcName: string; srcUrl: string; note: string; footage: string; date: string };
export type ArchivePins = FeatureCollection<Point, ArchivePinProps>;

const ok = (lon: unknown, lat: unknown) => typeof lon === 'number' && typeof lat === 'number' && Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90;

export function archivePins(raw: unknown): ArchivePins {
  const features: Feature<Point, ArchivePinProps>[] = [];
  if (Array.isArray(raw)) {
    for (const p of raw as unknown[][]) {
      if (!ok(p[1], p[2])) continue;
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p[1] as number, p[2] as number] }, properties: { id: `p${p[0]}`, clip: Number(p[0]), lvl: Number(p[3]) || 0, ci: Number(p[4]) || 0, day: typeof p[5] === 'number' ? p[5] : -1, kind: 'pin', title: '', srcName: '', srcUrl: '', note: '', footage: '', date: '' } });
    }
  }
  return { type: 'FeatureCollection', features };
}

interface RawExt { lat?: number; lon?: number; level?: string; title?: string; date?: string | null; source?: { name?: string; url?: string; attribution?: string }; footage_url?: string }

export function archiveExternal(raw: unknown): ArchivePins {
  const features: Feature<Point, ArchivePinProps>[] = [];
  if (Array.isArray(raw)) {
    for (const e of raw as RawExt[]) {
      if (!ok(e.lon, e.lat)) continue;
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lon!, e.lat!] }, properties: { id: `e${features.length}`, clip: -1, lvl: String(e.level ?? '').includes('4') ? 4 : 3, ci: -1, day: -1, kind: 'ext', title: e.title ?? '', srcName: e.source?.name ?? '', srcUrl: e.source?.url ?? '', note: e.source?.attribution ?? '', footage: e.footage_url ?? '', date: e.date ?? '' } });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Approximate places: only used as density, never drawn as exact points (rule of the archive). */
export function archiveDots(raw: unknown): FeatureCollection<Point, { w: number }> {
  const features: Feature<Point, { w: number }>[] = [];
  if (Array.isArray(raw)) {
    for (const d of raw as unknown[][]) if (ok(d[1], d[2])) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [d[1] as number, d[2] as number] }, properties: { w: 1 } });
  }
  return { type: 'FeatureCollection', features };
}

export const dayToDate = (epoch: string, day: number): string => (day >= 0 ? new Date(Date.parse(`${epoch}T00:00:00Z`) + day * 86_400_000).toISOString().slice(0, 10) : '');

export const CAT_LABEL: Record<string, string> = {
  casualty: 'Opfer', demolition: 'Zerstörung', detention: 'Gefangenschaft', displace: 'Vertreibung', execution: 'Hinrichtungen', incitement: 'Anstiftung', legal: 'Juristisches',
  looting: 'Plünderungen', massacre: 'Massaker', medical: 'Medizinisches', military: 'Militärisches', nocaption: 'Ohne Text', other: 'Sonstiges', press: 'Presse', seizure: 'Beschlagnahmung',
  settler: 'Siedler', shelter: 'Schutzbauten', siege: 'Belagerung', starvation: 'Hunger', strike: 'Angriffe', urbicide: 'Stadtzerstörung',
};

/** First line of the caption (before the "[Original post]" block) as a title and a short rest. */
export function captionParts(cap: string): { title: string; text: string } {
  const c = cap.trim();
  if (!c) return { title: '', text: '' };
  const head = c.split('[Original post]')[0]!.trim();
  const first = head.split('\n').find((x) => x.trim()) ?? '';
  const rest = c.slice(c.indexOf(first) + first.length).replace(/\s*\[Original post\]\s*/, ' ').trim();
  return { title: first.slice(0, 140), text: rest.length > 320 ? `${rest.slice(0, 320)} …` : rest };
}
