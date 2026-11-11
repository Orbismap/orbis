// Colour ramps and expression helpers shared by the ocean layers (not a parser; see gibsdaily.ts for why it lives here).
import type { ExpressionSpecification } from 'maplibre-gl';

export type Stops = [value: number, color: string][];

/** Significant wave height in m. */
export const WAVE_STOPS: Stops = [[0, '#4fc3f7'], [1, '#26c6da'], [2, '#66bb6a'], [3.5, '#ffee58'], [5, '#ffa726'], [7, '#ef5350'], [10, '#ab47bc']];

/** Sea surface temperature in °C, the ramp of the GHRSST MUR product on NASA GIBS (legend colours). */
export const SST_STOPS: Stops = [
  [0, '#2b001a'], [2.25, '#5b0351'], [4.8, '#6b0870'], [7.2, '#280b4d'], [9.75, '#1f2c73'], [12.15, '#2151a4'], [14.7, '#2a88d7'],
  [17.1, '#29abbf'], [19.65, '#62cc00'], [22.05, '#fcf300'], [24.6, '#ff9900'], [27, '#ec5300'], [29.55, '#bb1f00'], [32, '#6b0200'],
];

/** Linear colour interpolation of an input expression over the stops. */
export const rampExpr = (input: ExpressionSpecification | number, stops: Stops): ExpressionSpecification =>
  ['interpolate', ['linear'], input, ...stops.flat()] as unknown as ExpressionSpecification;

export const compass = (deg: number): string => ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
