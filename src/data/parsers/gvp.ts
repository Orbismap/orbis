// Smithsonian GVP Holocene volcanoes (WFS GeoJSON) -> slim points with an activity state and the
// facts an inspector card can show (photo, tectonic setting, rock type, a short excerpt of the summary).
import type { Feature, FeatureCollection, Point } from 'geojson';

export type VolcanoState = 'active' | 'historic' | 'dormant';
export type VolcanoProps = {
  id: number;
  name: string;
  type: string;
  country: string;
  region: string;
  /** m above sea level */
  elev: number | null;
  /** last known eruption year (negative = BCE), null = no eruption known */
  last: number | null;
  /** active: eruption this or last year; historic: since 1900; dormant: older or unknown */
  state: VolcanoState;
  /** 2 / 1 / 0 for sort keys */
  rank: 0 | 1 | 2;
  /** landform ("Stratovolcano", "Maar", …) and subregion of the volcanic province */
  landform?: string;
  subregion?: string;
  /** tectonic setting, e.g. "Rift zone / Continental crust (> 25 km)" */
  setting?: string;
  /** dominant rock type, e.g. "Foidite" */
  rock?: string;
  /** "Holocene" or "Pleistocene" */
  epoch?: string;
  /** how the last eruption was dated, e.g. "Eruption Dated" */
  evidence?: string;
  /** first sentences of the GVP summary, trimmed */
  summary?: string;
  photo?: string;
  photoCaption?: string;
  photoCredit?: string;
};
export type VolcanoCollection = FeatureCollection<Point, VolcanoProps>;

interface Raw {
  geometry?: { type?: string; coordinates?: number[] };
  properties?: Record<string, unknown>;
}

const text = (v: unknown, max?: number): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return undefined;
  return max && s.length > max ? s.slice(0, max).replace(/\s+\S*$/, '') + ' …' : s;
};

/** The first two sentences of the GVP summary — enough for a card, without carrying the whole 1 KB text. */
export function summaryExcerpt(raw: unknown): string | undefined {
  const s = text(raw);
  if (!s) return undefined;
  if (s.length <= 260) return s;
  const cut = s.slice(0, 320);
  const end = cut.search(/\.\s/);
  return end > 80 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + ' …';
}

export function gvpVolcanoes(raw: unknown, args?: { now?: number }): VolcanoCollection {
  const year = new Date(args?.now ?? Date.now()).getUTCFullYear();
  const features: Feature<Point, VolcanoProps>[] = [];
  const list = (raw as { features?: Raw[] } | null)?.features;
  if (!Array.isArray(list)) return { type: 'FeatureCollection', features };
  for (const f of list) {
    const p = f.properties;
    const c = f.geometry?.coordinates;
    if (!p || f.geometry?.type !== 'Point' || !c || c.length < 2) continue;
    const id = Number(p.Volcano_Number);
    if (!Number.isFinite(id)) continue;
    const lastRaw = p.Last_Eruption_Year;
    const last = typeof lastRaw === 'number' && Number.isFinite(lastRaw) ? lastRaw : null;
    const state: VolcanoState = last !== null && last >= year - 1 ? 'active' : last !== null && last >= 1900 ? 'historic' : 'dormant';
    const elev = Number(p.Elevation);
    const photo = text(p.Primary_Photo_Link);
    features.push({
      type: 'Feature',
      id,
      geometry: { type: 'Point', coordinates: [c[0]!, c[1]!] },
      properties: {
        id,
        name: String(p.Volcano_Name ?? 'Vulkan'),
        type: String(p.Primary_Volcano_Type ?? '').replace(/\(es\)|\(s\)/g, '').trim(),
        country: String(p.Country ?? ''),
        region: String(p.Region ?? ''),
        elev: p.Elevation == null || !Number.isFinite(elev) ? null : elev,
        last,
        state,
        rank: state === 'active' ? 2 : state === 'historic' ? 1 : 0,
        landform: text(p.Volcanic_Landform),
        subregion: text(p.Subregion),
        setting: text(p.Tectonic_Setting),
        rock: text(p.Major_Rock_Type),
        epoch: text(p.Geologic_Epoch),
        evidence: text(p.Evidence_Category),
        summary: summaryExcerpt(p.Geological_Summary),
        photo: photo && /^https:\/\//.test(photo) ? photo : undefined,
        photoCaption: text(p.Primary_Photo_Caption, 220),
        photoCredit: text(p.Primary_Photo_Credit, 160),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
