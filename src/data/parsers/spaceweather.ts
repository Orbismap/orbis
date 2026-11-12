// NOAA SWPC real-time space weather: solar wind plasma and magnetic field (json/rtsw, 1-minute records from several
// spacecraft, newest first, `active` marks the primary source) and the GOES X-ray flux (0.1-0.8 nm).

export interface SolarWind { time: number; speed: number; density: number | null; source: string; /** km/s change over the last hour, if known */ trend?: number }
export interface SolarMag { time: number; bz: number; bt: number | null; source: string; /** mean Bz of the last 30 min */ bz30: number | null; /** lowest Bz of the last 30 min */ bzMin30: number | null }
export interface XrayFlux { time: number; flux: number; cls: string; peakFlux: number; peakCls: string; peakTime: number; satellite: number | null }

const ts = (s: unknown) => (typeof s === 'string' ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`) : NaN);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

interface Rec { time: number; active: boolean; source: string; row: Record<string, unknown> }
function records(raw: unknown, field: string): Rec[] {
  const out: Rec[] = [];
  if (!Array.isArray(raw)) return out;
  for (const r of raw as Record<string, unknown>[]) {
    const time = ts(r?.time_tag);
    if (!Number.isFinite(time) || num(r[field]) === null) continue;
    out.push({ time, active: r.active === true, source: String(r.source ?? ''), row: r });
  }
  return out;
}
/** Records of the primary source if there are any, else of all. Newest first. */
const primary = (recs: Rec[]): Rec[] => {
  const act = recs.filter((r) => r.active);
  return (act.length ? act : recs).sort((a, b) => b.time - a.time);
};

export function swWind(raw: unknown): SolarWind | undefined {
  const recs = primary(records(raw, 'proton_speed'));
  const r = recs[0];
  if (!r) return undefined;
  const speed = num(r.row.proton_speed)!;
  const old = recs.find((x) => x.time <= r.time - 55 * 60_000);
  const oldSpeed = old ? num(old.row.proton_speed) : null;
  return { time: r.time, speed, density: num(r.row.proton_density), source: r.source, trend: oldSpeed === null ? undefined : speed - oldSpeed };
}

export function swMag(raw: unknown): SolarMag | undefined {
  const recs = primary(records(raw, 'bz_gsm'));
  const r = recs[0];
  if (!r) return undefined;
  const recent = recs.filter((x) => x.time > r.time - 30 * 60_000).map((x) => num(x.row.bz_gsm)!);
  return {
    time: r.time,
    bz: num(r.row.bz_gsm)!,
    bt: num(r.row.bt),
    source: r.source,
    bz30: recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null,
    bzMin30: recent.length ? Math.min(...recent) : null,
  };
}

/** GOES flare class of a 0.1-0.8 nm flux in W/m²: "C2.3", "M5.0", "X1.2" (below A: "A0.0"). */
export function xrayClass(flux: number): string {
  if (!(flux > 0)) return 'A0.0';
  const letters = ['A', 'B', 'C', 'M', 'X'];
  const exp = Math.floor(Math.log10(flux));
  const idx = Math.min(4, Math.max(0, exp + 8));
  const base = 10 ** (idx - 8);
  return `${letters[idx]}${(flux / base).toFixed(1)}`;
}

export function swXray(raw: unknown): XrayFlux | undefined {
  const recs = records(raw, 'flux').filter((r) => r.row.energy === '0.1-0.8nm');
  if (!recs.length) return undefined;
  recs.sort((a, b) => b.time - a.time);
  const last = recs[0]!;
  let peak = last;
  for (const r of recs) if (num(r.row.flux)! > num(peak.row.flux)!) peak = r;
  const flux = num(last.row.flux)!;
  const peakFlux = num(peak.row.flux)!;
  return { time: last.time, flux, cls: xrayClass(flux), peakFlux, peakCls: xrayClass(peakFlux), peakTime: peak.time, satellite: num(last.row.satellite) };
}

// ---- plain-language meaning (German) ----
/** Planetary Kp: storm scale and meaning. */
export function kpInfo(kp: number): { level: number; label: string; text: string } {
  if (kp >= 9) return { level: 5, label: 'G5 · extremer Sturm', text: 'Polarlicht bis in die Subtropen möglich, Stromnetze und Satelliten können gestört werden.' };
  if (kp >= 8) return { level: 4, label: 'G4 · schwerer Sturm', text: 'Polarlicht bis in mittlere Breiten, Störungen bei Funk und Navigation möglich.' };
  if (kp >= 7) return { level: 3, label: 'G3 · starker Sturm', text: 'Polarlicht in Mitteleuropa gut möglich, Satellitennavigation kann schwanken.' };
  if (kp >= 6) return { level: 2, label: 'G2 · mäßiger Sturm', text: 'Polarlicht bis etwa Norddeutschland denkbar.' };
  if (kp >= 5) return { level: 1, label: 'G1 · kleiner Sturm', text: 'Polarlicht in Skandinavien und Kanada auffällig, bei Glück bis Nordeuropa.' };
  if (kp >= 4) return { level: 0, label: 'unruhig', text: 'Polarlicht vor allem in hohen Breiten.' };
  return { level: 0, label: 'ruhig', text: 'Das Erdmagnetfeld ist ruhig, Polarlicht nur nahe der Pole.' };
}

export function windInfo(v: number): string {
  if (v >= 800) return 'extrem schnell';
  if (v >= 600) return 'sehr schnell';
  if (v >= 500) return 'schnell';
  if (v >= 400) return 'normal';
  return 'langsam';
}

export function bzInfo(bz: number): string {
  if (bz <= -10) return 'stark nach Süden: öffnet das Magnetfeld der Erde weit, Stürme wahrscheinlich';
  if (bz <= -5) return 'nach Süden: begünstigt Polarlicht';
  if (bz < 0) return 'leicht nach Süden: schwache Ankopplung';
  return 'nach Norden: kaum Ankopplung an die Erde';
}

export function xrayInfo(cls: string): string {
  const l = cls[0];
  const n = Number(cls.slice(1));
  if (l === 'X') return n >= 20 ? 'R5 · extremer Funkausfall auf der Tagseite' : n >= 10 ? 'R4 · schwerer Funkausfall' : 'R3 · starker Funkausfall auf der Tagseite';
  if (l === 'M') return n >= 5 ? 'R2 · mäßiger Funkausfall (Kurzwelle, Tagseite)' : 'R1 · kleiner Funkausfall (Kurzwelle, Tagseite)';
  if (l === 'C') return 'schwache Eruption, ohne Folgen für die Erde';
  return 'Sonne ruhig';
}

