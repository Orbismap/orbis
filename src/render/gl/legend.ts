// LegendSpec of a colour scale (values stay in base units; the legend UI converts to the user's units).
import { legendStops, type ColorScale } from '../../core/color';
import type { LegendSpec } from '../../layers/types';

export function scaleLegend(scale: ColorScale, n = 16): LegendSpec {
  return { type: 'scale', unit: scale.unit ?? '', stops: legendStops(scale, n), ticks: scale.ticks ?? [] };
}
