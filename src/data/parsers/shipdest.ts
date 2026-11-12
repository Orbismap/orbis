// AIS destination text -> a port from public/data/ports.json. Crews type free text: "NLRTM", "NL RTM", "HAMBURG",
// "ROTTERDAM>ANTWERP", "SINGAPORE FOR ORDERS", "DE HAM". Only a clear match counts: UN/LOCODE first, else a port name
// that is unique or (when several share the name) the one nearest to the ship. No match -> null (no line is drawn).
export type PortRow = [lng: number, lat: number, name: string, code: string, ...rest: unknown[]];
export type DestPort = { lng: number; lat: number; name: string; code: string };

const norm = (s: string) => s.toUpperCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const NOISE = /\b(FOR ORDERS?|ORDERS?|F O|ANCHORAGE|ANCH|ROADS?|PILOT STATION|PILOT|OPL|TBN|TBA|NIL|NONE|AT SEA)\b/g;

/** The last leg of a destination text ("A>B", "A - B", "A TO B", "A,B"), cleaned. */
export function destinationTail(text: string): string {
  const parts = text.split(/>|\s-+\s|\bTO\b|,|;|\//i).map((s) => norm(s).replace(NOISE, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

export class PortIndex {
  private byCode = new Map<string, DestPort>();
  private byName = new Map<string, DestPort[]>();
  constructor(rows: PortRow[]) {
    for (const r of rows) {
      if (typeof r[0] !== 'number' || typeof r[1] !== 'number') continue;
      const p: DestPort = { lng: r[0], lat: r[1], name: String(r[2]), code: String(r[3] ?? '') };
      if (p.code && !this.byCode.has(p.code)) this.byCode.set(p.code, p);
      const k = norm(p.name);
      if (k.length >= 3) (this.byName.get(k) ?? this.byName.set(k, []).get(k)!).push(p);
    }
  }
  /** `from` (lng, lat) of the ship breaks ties between ports of the same name. */
  resolve(text: string, from?: [number, number]): DestPort | null {
    const t = destinationTail(text);
    if (!t) return null;
    const code = /^([A-Z]{2}) ?([A-Z2-9]{3})$/.exec(t);
    if (code) { const p = this.byCode.get(`${code[1]}${code[2]}`); if (p) return p; }
    const c = this.byName.get(t);
    if (!c?.length) return null;
    if (c.length === 1 || !from) return c.length === 1 ? c[0]! : null;
    const d = (p: DestPort) => (p.lng - from[0]) ** 2 + (p.lat - from[1]) ** 2;
    return c.reduce((a, b) => (d(b) < d(a) ? b : a));
  }
}
