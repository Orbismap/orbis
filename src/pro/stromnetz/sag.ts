// Sag of a conductor between two insulators: a parabola, which is what a catenary is for the spans of a power line.
// Pure, so it can be tested without three.js.

/** Horizontal tension over the weight per metre (m): the larger, the tighter the wire. Higher voltage, longer spans, tighter wires. */
export function sagParameterM(voltageKv: number, earth = false): number {
  const base = voltageKv >= 300 ? 2300 : voltageKv >= 200 ? 2000 : voltageKv >= 100 ? 1600 : voltageKv >= 50 ? 1100 : 750;
  // the earth wire hangs a little tighter than the conductors
  return earth ? base * 1.2 : base;
}

/** Sag at the middle of a span (m): `span² / (8 H)`, never more than `maxM` (so the wire stays off the ground). */
export function sagM(spanM: number, voltageKv: number, maxM: number, earth = false): number {
  const sag = (spanM * spanM) / (8 * sagParameterM(voltageKv, earth));
  return Math.max(0, Math.min(sag, maxM));
}

/** Height of the wire at `t` (0…1) along a span whose ends sit at `alt0` and `alt1`, with `sag` in the middle. */
export function wireAltM(alt0: number, alt1: number, sag: number, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return alt0 + (alt1 - alt0) * u - sag * 4 * u * (1 - u);
}

/** How finely a span is subdivided for the drawn curve: about every 20 m, at least 4 and at most 16 segments. */
export function spanSegments(spanM: number): number {
  return Math.max(4, Math.min(16, Math.ceil(spanM / 20)));
}
