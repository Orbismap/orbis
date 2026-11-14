// Shared by the water layers (OpenInfraMap water tiles): colours, labels and the wikipedia link of a tile feature.
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { str } from './openinframap';

export const WATER = '#3E8BFF', HOT = '#FF7A59', SEWAGE = '#A98467', TREAT = '#2EC4B6', WASTE = '#C08552', RESERVOIR = '#7CC4FF', PUMP = '#9AA3B2';
export const expr = (e: unknown) => e as ExpressionSpecification;
export const flt = (e: unknown) => e as FilterSpecification;

export const SUBSTANCE: Record<string, string> = { water: 'Wasser', hot_water: 'Heißwasser', steam: 'Dampf', sewage: 'Abwasser', wastewater: 'Abwasser', waterwaste: 'Abwasser', rainwater: 'Regenwasser', drain: 'Entwässerung' };
export const USAGE: Record<string, string> = { distribution: 'Verteilleitung', transmission: 'Fernleitung', transportation: 'Transportleitung', facility: 'Anlagenleitung', penstock: 'Druckrohrleitung' };

/** Circle radius growing with the zoom. */
export const dot = (min: number, max: number) => expr(['interpolate', ['linear'], ['zoom'], 5, min, 12, max, 16, max * 1.6]);

/** "de:Kermeterstollen" -> link to the wikipedia article of that language. */
export function wikipediaLink(p: Record<string, unknown>): { label: string; url: string }[] {
  const w = str(p.wikipedia);
  const i = w.indexOf(':');
  return i > 0 ? [{ label: 'Wikipedia', url: `https://${w.slice(0, i)}.wikipedia.org/wiki/${encodeURIComponent(w.slice(i + 1))}` }] : [];
}
