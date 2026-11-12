/** Most rows of the map legend; further layers with a legend fold into "+n". */
export const MAX_LEGENDS = 3;
/** Longest class/symbol legend on the map; the rest is on the layer's detail page. */
export const MAX_ITEMS = 6;

/** Tick values for the thin map legend: min, one or two in between, max. */
export function pickTicks(ticks: number[]): number[] {
  if (ticks.length <= 4) return ticks;
  const last = ticks.length - 1;
  return [ticks[0]!, ticks[Math.round(last / 3)]!, ticks[Math.round((2 * last) / 3)]!, ticks[last]!];
}
