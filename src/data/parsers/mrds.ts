// USGS Mineral Resources Data System (WFS 1.0.0, GML) -> points with a commodity group (shared with the Wikidata groups).
// Regex based on purpose: parsers run in a worker, where there is no DOMParser.
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { ResourceGroup } from './resources';

export type MrdsProps = { id: string; name: string; status: string; commodities: string; group: ResourceGroup; url: string };
export type MrdsCollection = FeatureCollection<Point, MrdsProps>;

const STATUS: Record<string, string> = { Producer: 'in Förderung', 'Past Producer': 'ehemals gefördert', Prospect: 'Prospekt', Occurrence: 'Vorkommen', Plant: 'Aufbereitung' };

/** USGS commodity codes -> German name and group. Unknown codes stay as they are. */
const CODES: Record<string, [string, ResourceGroup]> = {
  AU: ['Gold', 'metal'], AG: ['Silber', 'metal'], CU: ['Kupfer', 'metal'], PB: ['Blei', 'metal'], ZN: ['Zink', 'metal'], FE: ['Eisen', 'metal'],
  NI: ['Nickel', 'metal'], CO: ['Kobalt', 'metal'], MN: ['Mangan', 'metal'], CR: ['Chrom', 'metal'], MO: ['Molybdän', 'metal'], W: ['Wolfram', 'metal'],
  SN: ['Zinn', 'metal'], SB: ['Antimon', 'metal'], HG: ['Quecksilber', 'metal'], AL: ['Aluminium/Bauxit', 'metal'], TI: ['Titan', 'metal'], V: ['Vanadium', 'metal'],
  PT: ['Platin', 'metal'], PGE: ['Platingruppe', 'metal'], LI: ['Lithium', 'metal'], REE: ['Seltene Erden', 'metal'], BE: ['Beryllium', 'metal'], NB: ['Niob', 'metal'],
  TA: ['Tantal', 'metal'], ZR: ['Zirkon', 'metal'], MG: ['Magnesium', 'metal'], AS: ['Arsen', 'metal'], BI: ['Bismut', 'metal'], CD: ['Cadmium', 'metal'],
  U: ['Uran', 'uranium'], TH: ['Thorium', 'uranium'],
  COAL: ['Kohle', 'coal'], LIGN: ['Braunkohle', 'coal'], ANTH: ['Anthrazit', 'coal'], PEAT: ['Torf', 'coal'],
  OIL: ['Erdöl', 'oilgas'], PET: ['Erdöl', 'oilgas'], NG: ['Erdgas', 'oilgas'], GAS: ['Erdgas', 'oilgas'],
  SALT: ['Salz', 'salt'], POTA: ['Kali', 'salt'], K: ['Kali', 'salt'], NA: ['Natrium', 'salt'], BORA: ['Borate', 'salt'], B: ['Bor', 'salt'],
  DIAM: ['Diamanten', 'gem'], GEM: ['Edelsteine', 'gem'], GMS: ['Edelsteine', 'gem'], OPAL: ['Opal', 'gem'], JADE: ['Jade', 'gem'],
  SDG: ['Sand & Kies', 'other'], SAND: ['Sand', 'other'], GRVL: ['Kies', 'other'], STN: ['Naturstein', 'other'], LS: ['Kalkstein', 'other'], CLY: ['Ton', 'other'],
  GYP: ['Gips', 'other'], BAR: ['Baryt', 'other'], FLUO: ['Fluorit', 'other'], F: ['Fluor', 'other'], PHOS: ['Phosphat', 'other'], P: ['Phosphat', 'other'], GRAP: ['Graphit', 'other'],
  ASB: ['Asbest', 'other'], TALC: ['Talk', 'other'], MICA: ['Glimmer', 'other'], FELD: ['Feldspat', 'other'], DIAT: ['Kieselgur', 'other'], ZEOL: ['Zeolith', 'other'],
};
const PRIORITY: ResourceGroup[] = ['oilgas', 'uranium', 'coal', 'gem', 'salt', 'metal', 'other'];

export function mrdsCommodities(codes: string): { names: string; group: ResourceGroup } {
  const list = codes.split(/[\s,;]+/).filter(Boolean);
  const names: string[] = [];
  let group: ResourceGroup = 'other';
  let best = PRIORITY.length;
  for (const c of list) {
    const hit = CODES[c.toUpperCase()];
    const n = hit?.[0] ?? c;
    if (!names.includes(n)) names.push(n);
    const rank = PRIORITY.indexOf(hit?.[1] ?? 'other');
    if (rank < best) { best = rank; group = PRIORITY[rank]!; }
  }
  return { names: names.join(', '), group };
}

const tag = (block: string, name: string): string => {
  const m = new RegExp(`<ms:${name}>([^<]*)</ms:${name}>`, 'i').exec(block);
  return m ? m[1]!.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").trim() : '';
};

export function mrdsSites(raw: unknown): MrdsCollection {
  const features: Feature<Point, MrdsProps>[] = [];
  const text = typeof raw === 'string' ? raw : raw instanceof ArrayBuffer ? new TextDecoder().decode(raw) : '';
  for (const m of text.matchAll(/<gml:featureMember>([\s\S]*?)<\/gml:featureMember>/g)) {
    const block = m[1]!;
    const c = /<gml:Point[^>]*>\s*<gml:coordinates>\s*([-\d.eE]+)[ ,]+([-\d.eE]+)/.exec(block);
    if (!c) continue;
    const lon = Number(c[1]), lat = Number(c[2]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const dep = tag(block, 'dep_id');
    const status = tag(block, 'dev_stat');
    const { names, group } = mrdsCommodities(tag(block, 'code_list'));
    const name = tag(block, 'site_name');
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        id: `mrds-${dep || features.length}`, name: !name || name === 'Unknown' ? '' : name, status: STATUS[status] ?? status, commodities: names, group,
        url: dep ? `https://mrdata.usgs.gov/mrds/show-mrds.php?dep_id=${encodeURIComponent(dep)}` : 'https://mrdata.usgs.gov/mrds/',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
