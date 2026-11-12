// Value of the top layer under the mouse pointer that reports a numeric probe, in the layer's BASE unit
// (°C, km/h, hPa, mm). The legend draws a marker on its scale from this signal; the cursor tooltip
// (CursorTip) reads the same probe result (`cursorRows`), so both are fed from one frame-exact source.
import { effect, signal } from '@preact/signals';
import { getLayer } from '../../layers/registry';
import { probeAt } from '../../layers/runtime';
import type { LegendSpec } from '../../layers/types';
import { legends } from '../../state/session';
import { time } from '../../state/time';
import { pointerLngLat } from '../../state/ui';
import { unitConverter } from './units';

export const pointerValue = signal<{ layerId: string; value: number } | null>(null);

export interface CursorRow { layerId: string; text: string; color: string; name: string }
/** Rows of the cursor tooltip (at most 3); empty = no tooltip. */
export const cursorRows = signal<CursorRow[]>([]);
/** True while the tooltip must stay hidden: map moving/dragging, object hover active, pointer over HUD. */
export const cursorTipHidden = signal(false);

type Scale = Extract<LegendSpec, { type: 'scale' }>;

/** Colour of the scale at a value (CSS colour string; blends neighbouring stops in the browser). */
export function scaleColor(spec: Scale, v: number): string {
  const s = spec.stops;
  if (v <= s[0]![0]) return s[0]![1];
  for (let i = 1; i < s.length; i++) {
    const [v1, c1] = s[i]!;
    const [v0, c0] = s[i - 1]!;
    if (v <= v1) {
      const t = v1 === v0 ? 1 : (v - v0) / (v1 - v0);
      return `color-mix(in oklab, ${c0} ${((1 - t) * 100).toFixed(1)}%, ${c1})`;
    }
  }
  return s[s.length - 1]![1];
}

effect(() => {
  const p = pointerLngLat.value;
  void time.value; // re-read when the selected time changes
  if (!p) {
    pointerValue.value = null;
    if (cursorRows.peek().length) cursorRows.value = [];
    return;
  }
  const hits = (probeAt(p.lng, p.lat) as { layerId: string; numeric?: number }[]).filter((r) => typeof r.numeric === 'number');
  const hit = hits[0];
  const next = hit ? { layerId: hit.layerId, value: hit.numeric! } : null;
  const cur = pointerValue.peek();
  if (cur?.layerId !== next?.layerId || cur?.value !== next?.value) pointerValue.value = next;

  const lg = legends.peek();
  const rows: CursorRow[] = [];
  for (const h of hits) {
    const spec = lg[h.layerId];
    if (spec?.type !== 'scale') continue;
    const u = unitConverter(spec.unit);
    const text = spec.format && u.label === spec.unit ? spec.format(h.numeric!) : u.fmt(h.numeric!);
    rows.push({ layerId: h.layerId, text: `${text} ${u.label}`, color: scaleColor(spec, h.numeric!), name: getLayer(h.layerId)?.title ?? h.layerId });
    if (rows.length === 3) break;
  }
  const old = cursorRows.peek();
  if (old.length !== rows.length || rows.some((r, i) => r.text !== old[i]!.text || r.layerId !== old[i]!.layerId || r.color !== old[i]!.color)) cursorRows.value = rows;
});
