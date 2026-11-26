import { createDbDelays, DEFAULT_DELAYS_URL } from './delays';
import { createTransitous } from './transitous';
import type { DelayEnricher, TransitProvider } from './types';

export interface Sources {
  transit: TransitProvider;
  /** null, wenn die DB-Verspätungen abgeschaltet sind (`VITE_BAHN_DELAYS_URL=off`). */
  delays: DelayEnricher | null;
}

/** Die Quellen der App: Transitous für Suche, Abfahrten und Verbindungen, der DB-Worker für Zugverspätungen. */
export function createSources(): Sources {
  const url = (import.meta.env.VITE_BAHN_DELAYS_URL as string | undefined) ?? DEFAULT_DELAYS_URL;
  return { transit: createTransitous(), delays: url === 'off' ? null : createDbDelays({ baseUrl: url }) };
}

export * from './types';
export { MODE_GROUPS, isRail, modeGroup } from './modes';
export { plannedDepartures, plannedJourney } from './delays';
