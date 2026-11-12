// CTA Train Tracker (Chicago "L"), free key. Only active with the "cta" key. isDly = 1 means delayed.
import type { VehicleFeed, VehicleFix } from './vehicles';
import { getJson, toNum } from './feedutil';

const SRC = 'CTA „L“ (Chicago)';
const LINES: Record<string, string> = { red: 'Red', blue: 'Blue', brn: 'Brown', g: 'Green', org: 'Orange', p: 'Purple', pink: 'Pink', y: 'Yellow' };
interface Train { rn: string; destNm: string; nextStaNm?: string; lat: string; lon: string; heading: string; isDly: string; prdt?: string }
interface Raw { ctatt?: { route?: { '@name': string; train?: Train | Train[] }[] } }

export function ctaFixes(raw: Raw): VehicleFix[] {
  const out: VehicleFix[] = [];
  for (const r of raw.ctatt?.route ?? []) {
    const trains = Array.isArray(r.train) ? r.train : r.train ? [r.train] : [];
    for (const t of trains) {
      const lat = toNum(t.lat), lng = toNum(t.lon);
      if (lat === undefined || lng === undefined) continue;
      out.push({
        id: `cta:${t.rn}`, lng, lat, heading: toNum(t.heading), t: Date.parse(t.prdt ?? '') || Date.now(), kind: 'ubahn',
        line: `${LINES[r['@name']] ?? r['@name']} Line ${t.rn}`, op: 'CTA', to: t.destNm, next: t.nextStaNm, delay: t.isDly === '1' ? 1 : 0, src: SRC,
      });
    }
  }
  return out;
}
export const ctaFeed: VehicleFeed = {
  id: 'cta', label: SRC, bbox: [-88.0, 41.6, -87.5, 42.1], every: 30_000, key: 'cta',
  load: async ({ key, signal }) => ctaFixes(await getJson<Raw>(`https://lapi.transitchicago.com/api/1.0/ttpositions.aspx?key=${encodeURIComponent(key ?? '')}&rt=red,blue,brn,g,org,p,pink,y&outputType=JSON`, signal)),
};
