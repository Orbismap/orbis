import { createDbDelays, DEFAULT_DELAYS_URL } from './delays';
import { createLifts, type LiftLookup } from './lifts';
import { createTransitous } from './transitous';
import type { DelayEnricher, TransitProvider } from './types';

export interface Sources {
  transit: TransitProvider;
  /** null, wenn die DB-Verspätungen abgeschaltet sind (`VITE_BAHN_DELAYS_URL=off`). */
  delays: DelayEnricher | null;
  /** Aufzüge an Bahnhöfen, über denselben Worker; null, wenn er abgeschaltet ist. */
  lifts: LiftLookup | null;
}

/** Die Quellen der App: Transitous für Suche, Abfahrten und Verbindungen, der DB-Worker für Zugverspätungen. */
export function createSources(): Sources {
  const url = (import.meta.env.VITE_BAHN_DELAYS_URL as string | undefined) ?? DEFAULT_DELAYS_URL;
  const worker = url !== 'off';
  return { transit: createTransitous(), delays: worker ? createDbDelays({ baseUrl: url }) : null, lifts: worker ? createLifts(url) : null };
}

export * from './types';
export { MODE_GROUPS, isRail, modeGroup } from './modes';
export { plannedDepartures, plannedJourney } from './delays';
