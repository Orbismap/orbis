// Kennzahlen einer Art für ihre Karte: Strecke, Tempo, Zugzeiten und was als Nächstes kommt. Alles aus den Angaben in species.ts.
import { haversine } from '../../core/geo';
import type { Phase } from './flock';
import type { Flyway, Species } from './species';

const MONTH = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Der häufigste Zugweg der Art. */
export const mainFlyway = (sp: Species): Flyway => sp.flyways.reduce((a, b) => (b.weight > a.weight ? b : a));

/** Länge des Zugwegs in km (Luftlinie über die Wegpunkte), einfach. */
export function routeKm(fw: Flyway, spring = false): number {
  const way = spring && fw.springVia ? fw.springVia : fw.via;
  const pts = spring ? [fw.winter, ...way, fw.breed] : [fw.breed, ...way, fw.winter];
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += haversine([pts[i - 1]![0], pts[i - 1]![1]], [pts[i]![0], pts[i]![1]]);
  return km;
}

/** "Anfang/Mitte/Ende Monat" für einen Tag im Jahr (1..365). */
export function doyLabel(doy: number): string {
  const d = new Date(Date.UTC(2023, 0, Math.round(doy)));
  const day = d.getUTCDate();
  return `${day <= 10 ? 'Anfang' : day <= 20 ? 'Mitte' : 'Ende'} ${MONTH[d.getUTCMonth()]}`;
}

/** Runden auf sinnvolle Stellen und Tausenderpunkt: 4 280 -> "4 300". */
export const roundKm = (km: number): string => (Math.round(km / 100) * 100).toLocaleString('de-DE').replace(/\./g, ' ');

export interface SpeciesFacts {
  /** ca. Strecke einfach in km, Tage und km pro Tag auf dem Herbstzug */
  km: number;
  autumnDays: number;
  kmPerDay: number;
  autumn: string;
  spring: string;
  /** Anzahl der Zugwege */
  ways: number;
  /** Was als Nächstes passiert */
  next: { label: string; value: string };
}

export function speciesFacts(sp: Species, phase: Phase): SpeciesFacts {
  const fw = mainFlyway(sp);
  const km = routeKm(fw);
  const [aStart] = sp.autumn;
  const [sStart] = sp.spring;
  const aDays = fw.days[0];
  const sDays = fw.days[1];
  let next: SpeciesFacts['next'];
  if (phase === 'herbst') next = { label: 'Ankunft', value: `etwa ${doyLabel(aStart + aDays)} im Winterquartier` };
  else if (phase === 'fruehjahr') next = { label: 'Ankunft', value: `etwa ${doyLabel(sStart + sDays)} im Brutgebiet` };
  else if (phase === 'winter') next = { label: 'Aufbruch', value: `${doyLabel(sStart)}, zurück ins Brutgebiet` };
  else next = { label: 'Aufbruch', value: `${doyLabel(aStart)}, ins Winterquartier` };
  return { km, autumnDays: aDays, kmPerDay: km / aDays, autumn: `${doyLabel(aStart)}, ${aDays} Tage`, spring: `${doyLabel(sStart)}, ${sDays} Tage`, ways: sp.flyways.length, next };
}
