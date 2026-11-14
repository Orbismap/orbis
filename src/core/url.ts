// Hash format: #/@<lat>,<lng>,<zoom>z[,<bearing>b][,<pitch>p]?k=<karte>&l=<id>,<id>…&t=<iso>&g=1&p=<lat>,<lng>,<name>,<region>[,<kind>]
// (p = a searched place; name, region and kind are percent-encoded, so their commas do not split)
export interface UrlView { lat: number; lng: number; zoom: number; bearing?: number; pitch?: number }
export interface UrlState {
  view?: UrlView;
  karte?: string;
  layers?: string[];
  /** Selected time in ms; absent = live. */
  time?: number;
  /** true = globe (g=1), false = mercator (g=0), undefined = default. */
  globe?: boolean;
  /** Searched place shown in the detail menu. */
  place?: { lat: number; lng: number; title: string; subtitle: string; kind?: string };
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
  if (k) out.karte = k;
  const l = q.get('l');
  if (l !== null) out.layers = l.split(',').filter(Boolean);
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
  const g = q.get('g');
  if (g === '1') out.globe = true;
  else if (g === '0') out.globe = false;
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
  if (s.karte) q.push(`k=${encodeURIComponent(s.karte)}`);
  if (s.layers) q.push(`l=${s.layers.map(encodeURIComponent).join(',')}`);
  if (s.time !== undefined) q.push(`t=${new Date(s.time).toISOString().slice(0, 16)}Z`);
  if (s.globe !== undefined) q.push(`g=${s.globe ? 1 : 0}`);
  if (s.place) q.push(`p=${[round(s.place.lat, 5), round(s.place.lng, 5), encodeURIComponent(s.place.title), encodeURIComponent(s.place.subtitle), ...(s.place.kind ? [encodeURIComponent(s.place.kind)] : [])].join(',')}`);
  return `#/${path}${q.length ? `?${q.join('&')}` : ''}`;
}
