// Hash format: #/@<lat>,<lng>,<zoom>z[,<bearing>b][,<pitch>p]?k=<ebene>&l=<id>,<id>…&b=<basemap>&m=<name>,<icon>,<color>[,<basemap>]&t=<iso>&g=1&s=0&f=flug:<hex>|schiff:<mmsi>&p=
// (k = the layer whose detail menu is open (older links: a Karte id); l = the active layers; s=0 = main sidebar collapsed;
//  b = the basemap on show, round-trips; the picker mode is not part of the link)
// r=<car|bike|foot>~<lat>,<lng>,<name>~<lat>,<lng>,<name>… (the route shown in the route menu)
// p=<lat>,<lng>,<name>,<region>[,<kind>]
// (p = a searched place; name, region and kind are percent-encoded, so their commas do not split)
import type { FollowRef } from '../ext/types';

export interface UrlView { lat: number; lng: number; zoom: number; bearing?: number; pitch?: number }
export interface UrlState {
  view?: UrlView;
  /** The open detail menu: a layer id (k=flugzeuge); older links carry a Karte id. */
  detail?: string;
  layers?: string[];
  /** A shared own Karte (m=name,icon,color[,basemap]): opening the link creates it with the layers of `l=`. */
  shared?: { name: string; icon: string; color: string; basemap?: string };
  /** Basemap id of the Karte (validated by the caller). */
  basemap?: string;
  /** Selected time in ms; absent = live. */
  time?: number;
  /** true = globe (g=1), false = mercator (g=0), undefined = default. */
  globe?: boolean;
  /** false = main sidebar collapsed (s=0); undefined/true = open (the default, never written). */
  sidebar?: boolean;
  /** Followed aircraft or ship (f=flug:<hex> / f=schiff:<mmsi>). */
  follow?: FollowRef;
  /** Searched place shown in the detail menu. */
  place?: { lat: number; lng: number; title: string; subtitle: string; kind?: string };
  /** The route shown in the route menu (r=<mode>~<lat>,<lng>,<title>~…): two to six stops. */
  route?: { mode: 'car' | 'bike' | 'foot'; stops: { lat: number; lng: number; title: string }[] };
}

const round = (v: number, d: number) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

export function parseHash(hash: string): UrlState {
  const out: UrlState = {};
  const h = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = h.split('?');
  const m = /^@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z((?:,-?\d+(?:\.\d+)?[bp])*)$/.exec(path);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    const zoom = Number(m[3]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 360 && zoom >= 0 && zoom <= 24) {
      const view: UrlView = { lat, lng, zoom };
      for (const part of (m[4] ?? '').split(',').filter(Boolean)) {
        const v = Number(part.slice(0, -1));
        if (part.endsWith('b')) view.bearing = v;
        else view.pitch = v;
      }
      out.view = view;
    }
  }
  const q = new URLSearchParams(query);
  const k = q.get('k');
  if (k) out.detail = k;
  const l = q.get('l');
  if (l !== null) out.layers = l.split(',').filter(Boolean);
  const sh = query.split('&').find((x) => x.startsWith('m='))?.slice(2);
  if (sh) {
    try {
      const [name, icon, color, basemap] = sh.split(',').map(decodeURIComponent);
      if (name && icon && color && /^[a-z0-9-]{1,24}$/.test(icon) && /^[0-9a-fA-F]{6}$/.test(color) && (!basemap || /^[a-z0-9-]{1,32}$/.test(basemap)))
        out.shared = { name: name.slice(0, 60), icon, color: `#${color}`, ...(basemap ? { basemap } : {}) };
    } catch {
      /* malformed escape: ignore */
    }
  }
  const b = q.get('b');
  // ids may be long regional ones and aliases (`>`), they are validated by the caller
  if (b && /^[a-z0-9->]{1,80}$/.test(b)) out.basemap = b;
  const t = q.get('t');
  if (t) {
    const ms = Date.parse(t);
    if (!Number.isNaN(ms)) out.time = ms;
  }
  const rawP = query.split('&').find((x) => x.startsWith('p='));
  if (rawP) {
    try {
      const [lat, lng, title, subtitle = '', kind] = rawP.slice(2).split(',').map(decodeURIComponent);
      const la = Number(lat);
      const lo = Number(lng);
      if (title && Math.abs(la) <= 90 && Math.abs(lo) <= 360) out.place = { lat: la, lng: lo, title, subtitle, ...(kind ? { kind } : {}) };
    } catch {
      /* malformed escape: ignore the place */
    }
  }
  const rawR = query.split('&').find((x) => x.startsWith('r='));
  if (rawR) {
    try {
      const [mode, ...parts] = rawR.slice(2).split('~');
      const stops = parts.map((part) => {
        const [lat, lng, ...title] = part.split(',');
        return { lat: Number(lat), lng: Number(lng), title: decodeURIComponent(title.join(',')).slice(0, 80) };
      });
      if ((mode === 'car' || mode === 'bike' || mode === 'foot') && stops.length >= 2 && stops.length <= 6 && stops.every((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng) && Math.abs(x.lat) <= 90 && Math.abs(x.lng) <= 360))
        out.route = { mode, stops };
    } catch {
      /* malformed escape: ignore the route */
    }
  }
  const f = /^(flug|schiff):([A-Za-z0-9_-]{1,32})$/.exec(q.get('f') ?? '');
  if (f) out.follow = { kind: f[1] as FollowRef['kind'], id: f[2]! };
  const g = q.get('g');
  if (g === '1') out.globe = true;
  else if (g === '0') out.globe = false;
  const s = q.get('s');
  if (s === '0') out.sidebar = false;
  else if (s === '1') out.sidebar = true;
  return out;
}

export function serializeHash(s: UrlState): string {
  let path = '';
  if (s.view) {
    const v = s.view;
    path = `@${round(v.lat, 4)},${round(v.lng, 4)},${round(v.zoom, 2)}z`;
    if (v.bearing) path += `,${Math.round(v.bearing)}b`;
    if (v.pitch) path += `,${Math.round(v.pitch)}p`;
  }
  const q: string[] = [];
  if (s.detail) q.push(`k=${encodeURIComponent(s.detail)}`);
  if (s.shared) q.push(`m=${[s.shared.name, s.shared.icon, s.shared.color.replace('#', ''), ...(s.shared.basemap ? [s.shared.basemap] : [])].map(encodeURIComponent).join(',')}`);
  if (s.layers) q.push(`l=${s.layers.map(encodeURIComponent).join(',')}`);
  if (s.basemap) q.push(`b=${encodeURIComponent(s.basemap)}`);
  if (s.time !== undefined) q.push(`t=${new Date(s.time).toISOString().slice(0, 16)}Z`);
  if (s.globe !== undefined) q.push(`g=${s.globe ? 1 : 0}`);
  if (s.sidebar === false) q.push('s=0');
  if (s.follow) q.push(`f=${s.follow.kind}:${encodeURIComponent(s.follow.id)}`);
  if (s.place) q.push(`p=${[round(s.place.lat, 5), round(s.place.lng, 5), encodeURIComponent(s.place.title), encodeURIComponent(s.place.subtitle), ...(s.place.kind ? [encodeURIComponent(s.place.kind)] : [])].join(',')}`);
  if (s.route) q.push(`r=${[s.route.mode, ...s.route.stops.map((x) => `${round(x.lat, 5)},${round(x.lng, 5)},${encodeURIComponent(x.title).replace(/~/g, '%7E')}`)].join('~')}`);
  return `#/${path}${q.length ? `?${q.join('&')}` : ''}`;
}
