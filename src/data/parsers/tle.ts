// CelesTrak TLE text (3 lines per object: name, line 1, line 2) -> records with the cheap orbit facts already extracted.
export type TleRec = {
  /** NORAD catalogue number */
  id: number;
  name: string;
  l1: string;
  l2: string;
  /** international designator, e.g. "1998-067A" */
  intl: string;
  /** inclination in degrees */
  inc: number;
  /** orbital period in minutes */
  period: number;
  /** epoch of the element set, ms since epoch */
  epoch: number;
};

export type TleArgs = {
  /** drop objects that share the orbit of an earlier one (docked modules of a station) */
  dedupe?: boolean;
  /** keep only objects whose name matches this regular expression source */
  only?: string;
} | undefined;

export function tleEpoch(l1: string): number {
  const yy = parseInt(l1.slice(18, 20), 10);
  const day = parseFloat(l1.slice(20, 32));
  if (!Number.isFinite(yy) || !Number.isFinite(day)) return NaN;
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return Date.UTC(year, 0, 1) + (day - 1) * 86_400_000;
}

export function intlDesignator(l1: string): string {
  const s = l1.slice(9, 17).trim();
  if (s.length < 5) return '';
  const yy = parseInt(s.slice(0, 2), 10);
  return `${yy < 57 ? 2000 + yy : 1900 + yy}-${s.slice(2)}`;
}

export function tleParse(raw: unknown, args?: TleArgs): TleRec[] {
  const text = typeof raw === 'string' ? raw : '';
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0);
  const out: TleRec[] = [];
  const orbits = new Set<string>();
  const only = args?.only ? new RegExp(args.only) : undefined;
  for (let i = 0; i + 2 < lines.length; ) {
    const name = lines[i]!;
    const l1 = lines[i + 1]!;
    const l2 = lines[i + 2]!;
    if (!l1.startsWith('1 ') || !l2.startsWith('2 ')) {
      i++; // out of sync: skip a line
      continue;
    }
    i += 3;
    const id = parseInt(l1.slice(2, 7), 10);
    const inc = parseFloat(l2.slice(8, 16));
    const mm = parseFloat(l2.slice(52, 63));
    if (!Number.isFinite(id) || !Number.isFinite(mm) || mm <= 0) continue;
    if (only && !only.test(name.trim())) continue;
    if (args?.dedupe) {
      const key = `${inc.toFixed(2)}|${parseFloat(l2.slice(17, 25)).toFixed(1)}|${mm.toFixed(2)}`;
      if (orbits.has(key)) continue;
      orbits.add(key);
    }
    out.push({ id, name: name.trim().replace(/^0 /, ''), l1, l2, intl: intlDesignator(l1), inc, period: 1440 / mm, epoch: tleEpoch(l1) });
  }
  return out;
}
