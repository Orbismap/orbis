import { convert, unitLabel, type Quantity } from '../../core/units';
import { formatNumber } from '../../core/format';

const MAP: Record<string, { q: Quantity; rate?: boolean }> = {
  '°C': { q: 'temperature' },
  'km/h': { q: 'wind' },
  'm/s': { q: 'wind' },
  hPa: { q: 'pressure' },
  mm: { q: 'precip' },
  'mm/h': { q: 'precip', rate: true },
};

/** Maps a legend unit string to the user's unit: converts base-unit values and relabels. */
export function unitConverter(unit: string): { label: string; conv(v: number): number; fmt(v: number): string } {
  const m = MAP[unit];
  if (!m) return { label: unit, conv: (v) => v, fmt: (v) => formatNumber(v, Number.isInteger(v) ? 0 : Math.abs(v) < 10 ? 1 : 0) };
  return {
    label: unitLabel(m.q, { rate: m.rate }),
    conv: (v) => convert(m.q, v),
    fmt: (v) => {
      const c = convert(m.q, v);
      return formatNumber(c, Number.isInteger(c) || Math.abs(c) >= 100 ? 0 : 1);
    },
  };
}
