// Shared pure helpers of the verkehr layers (not a parser): speed/altitude texts, countdowns, colour scales.
import { formatNumber, NNBSP } from '../../core/format';

export const MS_PER_KN = 0.514444;
export const KMH_PER_KN = 1.852;
export const M_PER_FT = 0.3048;

/** "850 km/h (459 kn)" for a speed in m/s. Vehicle speeds are shown in km/h and kn regardless of the wind unit setting. */
export function speedText(ms: number, withKnots = true): string {
  const kmh = ms * 3.6;
  const base = `${formatNumber(kmh, kmh < 10 ? 1 : 0)}${NNBSP}km/h`;
  return withKnots ? `${base} (${formatNumber(ms / MS_PER_KN, 0)}${NNBSP}kn)` : base;
}

/** "10.668 m (35.000 ft)" for an altitude in metres. */
export function altitudeText(m: number, withFeet = true): string {
  const base = `${formatNumber(Math.round(m))}${NNBSP}m`;
  return withFeet ? `${base} (${formatNumber(Math.round(m / M_PER_FT / 100) * 100)}${NNBSP}ft)` : base;
}

/** Vertical rate in m/s: "+12,5 m/s" (climb), "−8,0 m/s" (descent). */
export function rateText(ms: number): string {
  const s = ms > 0.05 ? '+' : ms < -0.05 ? '−' : '';
  return `${s}${formatNumber(Math.abs(ms), 1)}${NNBSP}m/s`;
}

/** Remaining time until `t` as a German phrase: "in 2 Tagen 3 Std.", "in 45 Min.", "vor 5 Min." (past). */
export function countdownText(t: number, now = Date.now()): string {
  const d = t - now;
  const a = Math.abs(d);
  const min = Math.round(a / 60_000);
  const h = Math.floor(min / 60);
  const days = Math.floor(h / 24);
  let body: string;
  if (min < 1) body = 'weniger als 1 Min.';
  else if (h < 1) body = `${min} Min.`;
  else if (days < 1) body = `${h} Std. ${min % 60} Min.`;
  else body = `${days} ${days === 1 ? 'Tag' : 'Tagen'}${h % 24 ? ` ${h % 24} Std.` : ''}`;
  if (min < 1) return d >= 0 ? 'in wenigen Sekunden' : 'gerade gestartet';
  return d >= 0 ? `in ${body}` : `vor ${body.replace('Tagen', 'Tag')}`;
}

/** Compass point (N, NO, O …) for a bearing. */
export function compass(deg: number): string {
  return ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
}

/** Colour stops as [value, '#rrggbb'] interpolated in sRGB; used where a JS side colour is needed (cards, legend). */
export function scaleColor(stops: [number, string][], v: number): string {
  if (v <= stops[0]![0]) return stops[0]![1];
  const last = stops[stops.length - 1]!;
  if (v >= last[0]) return last[1];
  for (let i = 1; i < stops.length; i++) {
    const [v1, c1] = stops[i]!;
    if (v <= v1) {
      const [v0, c0] = stops[i - 1]!;
      const f = (v - v0) / (v1 - v0);
      const p = (c: string, o: number) => parseInt(c.slice(1 + o * 2, 3 + o * 2), 16);
      const ch = (o: number) => Math.round(p(c0, o) + (p(c1, o) - p(c0, o)) * f).toString(16).padStart(2, '0');
      return `#${ch(0)}${ch(1)}${ch(2)}`;
    }
  }
  return last[1];
}

/** MapLibre `interpolate` expression over a property from colour stops. */
export const stopsExpr = (prop: string, stops: [number, string][]) =>
  ['interpolate', ['linear'], ['get', prop], ...stops.flat()] as unknown as import('maplibre-gl').ExpressionSpecification;

/** Altitude colour scale in metres (aircraft and balloons). */
export const ALT_STOPS: [number, string][] = [
  [0, '#ff9d3d'], [1500, '#ffd84a'], [4000, '#8fe05c'], [7000, '#2fcfc4'], [10000, '#4a8dff'], [13000, '#b06bff'],
];

/** Parses an ISO-ish timestamp, NaN when unusable. */
export const ts = (s: unknown): number => (typeof s === 'string' ? Date.parse(s) : typeof s === 'number' ? s : NaN);
