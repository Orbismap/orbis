// readsb / tar1090 JSON (adsb.lol `/v2/point`, adsb.fi `/api/v3`) -> track objects for the aircraft layer.
import type { TrackObject } from '../../render/tracks';

export const FT = 0.3048;
export const KN = 0.514444;

export type AircraftProps = {
  call: string; reg: string; type: string; desc: string; hex: string; country: string;
  /** barometric altitude in m, 0 on the ground */
  alt: number;
  /** vertical rate in m/s */
  vr: number;
  sq: string;
  /** true when on the ground */
  gnd: boolean;
  heli: boolean;
  mil: boolean;
  /** 7500 / 7600 / 7700 */
  emerg: boolean;
  cat: string;
  /** true track in degrees, -1 when unknown */
  trk: number;
  /** seconds since the position was last updated, as reported */
  age: number;
};

/** ICAO 24-bit address blocks -> state of registration. More specific blocks first. */
const BLOCKS: [number, number, string][] = [
  [0x7c0000, 0x7fffff, 'Australien'], [0x780000, 0x7bffff, 'China'], [0x840000, 0x87ffff, 'Japan'], [0x800000, 0x83ffff, 'Indien'],
  [0xa00000, 0xafffff, 'USA'], [0xc00000, 0xc3ffff, 'Kanada'], [0xc80000, 0xc87fff, 'Neuseeland'],
  [0x3c0000, 0x3fffff, 'Deutschland'], [0x380000, 0x3bffff, 'Frankreich'], [0x400000, 0x43ffff, 'Vereinigtes Königreich'],
  [0x300000, 0x33ffff, 'Italien'], [0x340000, 0x37ffff, 'Spanien'], [0x100000, 0x1fffff, 'Russland'],
  [0x440000, 0x447fff, 'Österreich'], [0x448000, 0x44ffff, 'Belgien'], [0x450000, 0x457fff, 'Bulgarien'], [0x458000, 0x45ffff, 'Dänemark'],
  [0x460000, 0x467fff, 'Finnland'], [0x468000, 0x46ffff, 'Griechenland'], [0x470000, 0x477fff, 'Ungarn'], [0x478000, 0x47ffff, 'Norwegen'],
  [0x480000, 0x487fff, 'Niederlande'], [0x488000, 0x48ffff, 'Polen'], [0x490000, 0x497fff, 'Portugal'], [0x498000, 0x49ffff, 'Tschechien'],
  [0x4a0000, 0x4a7fff, 'Rumänien'], [0x4a8000, 0x4affff, 'Schweden'], [0x4b0000, 0x4b7fff, 'Schweiz'], [0x4b8000, 0x4bffff, 'Türkei'],
  [0x4ca000, 0x4cafff, 'Irland'], [0x4cc000, 0x4ccfff, 'Island'], [0x4d0000, 0x4d03ff, 'Luxemburg'], [0x4d2000, 0x4d23ff, 'Malta'],
  [0x508000, 0x50ffff, 'Ukraine'], [0x510000, 0x517fff, 'Belarus'],
  [0x710000, 0x717fff, 'Saudi-Arabien'], [0x718000, 0x71ffff, 'Südkorea'], [0x728000, 0x72ffff, 'Irak'], [0x730000, 0x737fff, 'Iran'],
  [0x738000, 0x73ffff, 'Israel'], [0x740000, 0x747fff, 'Jordanien'], [0x750000, 0x757fff, 'Malaysia'], [0x758000, 0x75ffff, 'Philippinen'],
  [0x760000, 0x767fff, 'Pakistan'], [0x768000, 0x76ffff, 'Singapur'], [0x880000, 0x887fff, 'Thailand'], [0x888000, 0x88ffff, 'Vietnam'],
  [0x8a0000, 0x8a7fff, 'Indonesien'], [0x896000, 0x896fff, 'Vereinigte Arabische Emirate'], [0x06a000, 0x06afff, 'Katar'],
  [0x008000, 0x00ffff, 'Südafrika'], [0x010000, 0x017fff, 'Ägypten'], [0x020000, 0x027fff, 'Marokko'], [0x040000, 0x040fff, 'Äthiopien'],
  [0x0d0000, 0x0d7fff, 'Mexiko'], [0xe00000, 0xe3ffff, 'Argentinien'], [0xe40000, 0xe7ffff, 'Brasilien'], [0xe80000, 0xe80fff, 'Chile'],
];

export function countryOfHex(hex: string): string {
  const n = parseInt(hex, 16);
  if (!Number.isFinite(n)) return '';
  return BLOCKS.find(([a, b]) => n >= a && n <= b)?.[2] ?? '';
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Great-circle-free parse of one readsb aircraft; undefined without a position. */
export function parseAircraft(a: Record<string, unknown>, now: number): TrackObject | undefined {
  const lat = num(a.lat);
  const lng = num(a.lon);
  if (lat === undefined || lng === undefined) return undefined;
  const hex = String(a.hex ?? '').replace('~', '').toLowerCase();
  if (!hex) return undefined;
  const ground = a.alt_baro === 'ground';
  const altFt = num(a.alt_baro) ?? num(a.alt_geom);
  const trk = num(a.track) ?? num(a.true_heading) ?? num(a.mag_heading);
  const gs = num(a.gs);
  const vr = num(a.baro_rate) ?? num(a.geom_rate);
  const sq = typeof a.squawk === 'string' ? a.squawk : '';
  const cat = typeof a.category === 'string' ? a.category : '';
  const flags = num(a.dbFlags) ?? 0;
  const seen = num(a.seen_pos) ?? num(a.seen) ?? 0;
  const t = now - seen * 1000;
  const emergencyField = typeof a.emergency === 'string' && a.emergency !== 'none' && a.emergency !== '';
  const props: AircraftProps = {
    call: String(a.flight ?? '').trim(),
    reg: String(a.r ?? '').trim(),
    type: String(a.t ?? '').trim(),
    desc: String(a.desc ?? '').trim(),
    hex,
    country: countryOfHex(hex),
    alt: ground || altFt === undefined ? 0 : Math.round(altFt * FT),
    vr: vr === undefined ? 0 : Math.round(vr * FT / 60 * 10) / 10,
    sq,
    gnd: ground,
    heli: cat === 'A7',
    mil: (flags & 1) === 1,
    emerg: sq === '7500' || sq === '7600' || sq === '7700' || emergencyField,
    cat,
    trk: trk ?? -1,
    age: seen,
  };
  return {
    id: hex,
    lng,
    lat,
    heading: trk,
    speed: ground && (gs ?? 0) < 2 ? 0 : gs === undefined ? undefined : gs * KN,
    t,
    props: props as unknown as Record<string, string | number | boolean>,
  };
}

/** Whole response. Accepts `{ac: [...]}` (adsb.lol), `{aircraft: [...]}` (tar1090) and a bare array. */
export function aircraftReadsb(raw: unknown): TrackObject[] {
  const r = raw as { ac?: unknown[]; aircraft?: unknown[]; now?: number } | unknown[] | null;
  const list = Array.isArray(r) ? r : (r?.ac ?? r?.aircraft ?? []);
  const rawNow = !Array.isArray(r) ? r?.now : undefined;
  // `now` is epoch ms at adsb.lol and epoch seconds at tar1090-style servers
  const now = rawNow ? (rawNow < 1e11 ? rawNow * 1000 : rawNow) : Date.now();
  const out: TrackObject[] = [];
  for (const a of list) {
    if (typeof a !== 'object' || a === null) continue;
    const t = parseAircraft(a as Record<string, unknown>, now);
    if (t) out.push(t);
  }
  return out;
}

/** Centres and radius (nautical miles) of circles covering a bounding box; the API takes at most 250 nm per request. */
export function coverCircles(bounds: [number, number, number, number], maxNm = 250, maxN = 6): { lat: number; lng: number; nm: number }[] {
  const [w, s, e0, n] = bounds;
  const e = e0 < w ? e0 + 360 : e0;
  const kmPerNm = 1.852;
  const cLat = (s + n) / 2;
  const heightKm = (n - s) * 111.2;
  const widthKm = (e - w) * 111.2 * Math.max(0.2, Math.cos((cLat * Math.PI) / 180));
  // circle covering a square cell of side `a`: radius a/√2
  const maxKm = maxNm * kmPerNm;
  const cell = (maxKm * Math.SQRT2) * 0.95;
  const nx = Math.max(1, Math.ceil(widthKm / cell));
  const ny = Math.max(1, Math.ceil(heightKm / cell));
  const out: { lat: number; lng: number; nm: number }[] = [];
  const cellW = (e - w) / nx;
  const cellH = (n - s) / ny;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const lat = s + cellH * (j + 0.5);
      const lng = w + cellW * (i + 0.5);
      const hw = (cellW * 111.2 * Math.cos((lat * Math.PI) / 180)) / 2;
      const hh = (cellH * 111.2) / 2;
      const nm = Math.min(maxNm, Math.max(5, Math.ceil(Math.hypot(hw, hh) / kmPerNm)));
      out.push({ lat: Math.max(-89.9, Math.min(89.9, lat)), lng: ((((lng + 180) % 360) + 360) % 360) - 180, nm });
    }
  }
  if (out.length <= maxN) return out;
  // too many cells: keep those nearest to the view centre
  const cLng = (w + e) / 2;
  const d = (c: { lat: number; lng: number }) => Math.hypot(c.lat - cLat, (c.lng - cLng) * Math.cos((cLat * Math.PI) / 180));
  return out.sort((a, b) => d(a) - d(b)).slice(0, maxN);
}
