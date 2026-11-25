// Position im Jahr für die Basiskarte "Jahreszeiten" (Blue-Marble-Monatsbilder mit Überblendung) und ihren Regler.
import { signal } from '@preact/signals';

export const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'] as const;
export const MONTH_SHORT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const;

/** Position im Jahr in Monaten: 0 = 1. Januar, 6,5 = Mitte Juli; immer in [0, 12). */
export function seasonPosOf(t: number): number {
  const d = new Date(t);
  const m = d.getUTCMonth();
  const days = new Date(Date.UTC(d.getUTCFullYear(), m + 1, 0)).getUTCDate();
  return m + (d.getUTCDate() - 1 + d.getUTCHours() / 24) / days;
}

/** Die Position der Basiskarte, vorbelegt mit heute. Nicht gespeichert. */
export const seasonPos = signal(seasonPosOf(Date.now()));

export interface SeasonBlend {
  /** Monatsbild (0 = Januar) und das nächste */
  a: number;
  b: number;
  /** Anteil von `b` an der Mischung, 0..1 */
  mix: number;
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Ein Monatsbild zeigt die Monatsmitte (Position k + 0,5): dazwischen wird gemischt. */
export function seasonBlend(pos: number): SeasonBlend {
  const u = pos - 0.5;
  const a = Math.floor(u);
  return { a: mod12(a), b: mod12(a + 1), mix: u - a };
}

/** The year the monthly images come from (complete, 8-day composites 1 Jan, 9 Jan ... 27 Dec). */
export const SEASON_YEAR = 2023;

/** Start date (YYYY-MM-DD) of the 8-day composite closest to the middle of month `m` (0 = January). */
export function seasonDate(m: number): string {
  const doy = (Date.UTC(SEASON_YEAR, m, 15) - Date.UTC(SEASON_YEAR, 0, 1)) / 864e5;
  const k = Math.min(45, Math.round(doy / 8));
  return new Date(Date.UTC(SEASON_YEAR, 0, 1 + k * 8)).toISOString().slice(0, 10);
}

/** "Mitte Juli", "Anfang Mai" ... für die Anzeige am Regler. */
export function seasonLabel(pos: number): string {
  const p = ((pos % 12) + 12) % 12;
  const m = Math.floor(p);
  const f = p - m;
  const part = f < 1 / 3 ? 'Anfang' : f < 2 / 3 ? 'Mitte' : 'Ende';
  return `${part} ${MONTH_NAMES[m]}`;
}

export const setSeasonPos = (pos: number): void => {
  seasonPos.value = Math.min(11.999, Math.max(0, pos));
};
