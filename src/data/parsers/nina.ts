// NINA / BBK warnings (warnung.bund.de, api31): list per source (mapData.json), geometry (<id>.geojson) and text
// (<id>.json) are three separate documents; these pure functions slim each of them and join them to map features.
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

export const NINA_SOURCES = ['mowas', 'katwarn', 'biwapp', 'lhp', 'police'] as const;
export type NinaSource = (typeof NINA_SOURCES)[number];
export const NINA_SOURCE_LABEL: Record<string, string> = { mowas: 'MoWaS', katwarn: 'KATWARN', biwapp: 'BIWAPP', lhp: 'Hochwasserportal', police: 'Polizei', dwd: 'DWD' };
export const NINA_SEVERITY: Record<string, { level: 1 | 2 | 3 | 4; color: string; de: string }> = {
  Extreme: { level: 4, color: '#880E4F', de: 'extrem' },
  Severe: { level: 3, color: '#E53935', de: 'schwer' },
  Moderate: { level: 2, color: '#FB8C00', de: 'mittel' },
  Minor: { level: 1, color: '#FDD835', de: 'gering' },
};

export interface NinaListItem { id: string; src: string; version: number; severity: string; title: string; onset: number; expires: number }
export interface NinaDetail { headline: string; description: string; instruction: string; sender: string; expires: number; web: string }
export type NinaGeometry = Polygon | MultiPolygon;

export type NinaProps = {
  id: string;
  event: string;
  level: 1 | 2 | 3 | 4;
  color: string;
  headline: string;
  area: string;
  description: string;
  instruction: string;
  onset: number;
  expires: number;
  state: string;
  /** 'nina' (the merged warning layer tells it from DWD features) */
  origin: 'nina';
  sender: string;
  source: string;
  url: string;
};
export type NinaCollection = FeatureCollection<NinaGeometry, NinaProps>;

const ms = (v: unknown): number => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** HTML snippets of the CAP texts -> plain text with line breaks. */
export function plainText(v: unknown): string {
  return String(v ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** mapData.json of one source. All-clear and cancellation messages ("Cancel") are dropped. args: { src }. */
export function ninaList(raw: unknown, args?: { src?: string }): NinaListItem[] {
  if (!Array.isArray(raw)) return [];
  const out: NinaListItem[] = [];
  for (const w of raw as Record<string, unknown>[]) {
    if (!w || typeof w.id !== 'string' || w.type === 'Cancel') continue;
    const t = w.i18nTitle as Record<string, string> | undefined;
    out.push({
      id: w.id,
      src: args?.src ?? w.id.split('.')[0]!,
      version: Number(w.version) || 0,
      severity: String(w.severity ?? ''),
      title: t?.de ?? t?.en ?? 'Warnung',
      onset: ms(w.startDate),
      expires: ms(w.expiresDate),
    });
  }
  return out;
}

/** <id>.json (CAP): German info block, plain texts and the issuing authority. */
export function ninaDetail(raw: unknown): NinaDetail | undefined {
  const j = raw as { sender?: string; info?: Record<string, unknown>[] } | null;
  const infos = j?.info;
  if (!Array.isArray(infos) || !infos.length) return undefined;
  const info = infos.find((i) => String(i.language ?? '').toLowerCase() === 'de') ?? infos[0]!;
  const params = (info.parameter as { valueName: string; value: string }[] | undefined) ?? [];
  const par = (n: string) => params.find((p) => p.valueName === n)?.value ?? '';
  return {
    headline: plainText(info.headline),
    description: plainText(info.description),
    instruction: plainText(info.instruction),
    sender: par('sender_langname') || par('sender_signature') || String(j?.sender ?? ''),
    expires: ms(info.expires),
    web: String(info.web ?? ''),
  };
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const round = (c: unknown): unknown => (Array.isArray(c) ? (typeof c[0] === 'number' ? c.slice(0, 2).map((n) => r4(n as number)) : c.map(round)) : c);

/** <id>.geojson: all polygons of a warning as one MultiPolygon (points and lines are not drawn). */
export function ninaGeometry(raw: unknown): NinaGeometry | null {
  const list = (raw as { features?: { geometry?: { type?: string; coordinates?: unknown } | null }[] } | null)?.features;
  if (!Array.isArray(list)) return null;
  const polys: unknown[] = [];
  for (const f of list) {
    const g = f.geometry;
    if (g?.type === 'Polygon') polys.push(round(g.coordinates));
    else if (g?.type === 'MultiPolygon') polys.push(...(round(g.coordinates) as unknown[]));
  }
  return polys.length ? ({ type: 'MultiPolygon', coordinates: polys } as MultiPolygon) : null;
}

/** Joins list, geometry and text. Warnings without geometry are left out. */
export function ninaFeatures(items: readonly NinaListItem[], geo: ReadonlyMap<string, NinaGeometry>, details: ReadonlyMap<string, NinaDetail>): NinaCollection {
  const features: Feature<NinaGeometry, NinaProps>[] = [];
  for (const it of items) {
    const geometry = geo.get(it.id);
    if (!geometry) continue;
    const d = details.get(it.id);
    const sev = NINA_SEVERITY[it.severity] ?? NINA_SEVERITY.Moderate!;
    const label = NINA_SOURCE_LABEL[it.src] ?? it.src;
    features.push({
      type: 'Feature',
      geometry,
      properties: {
        id: it.id,
        event: label,
        level: sev.level,
        color: sev.color,
        headline: d?.headline || it.title,
        area: '',
        description: d?.description ?? '',
        instruction: d?.instruction ?? '',
        onset: it.onset,
        expires: it.expires || d?.expires || 0,
        state: '',
        origin: 'nina',
        sender: d?.sender ?? '',
        source: label,
        url: `https://warnung.bund.de/meldungen/${encodeURIComponent(it.id)}`,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
