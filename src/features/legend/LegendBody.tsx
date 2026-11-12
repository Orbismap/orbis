import type { LegendSpec } from '../../layers/types';
import { unitConverter } from './units';
import './legend.css';

const shape = (s?: 'dot' | 'line' | 'square') => s ?? 'dot';

/** Renders a LegendSpec. Used on the layer detail page (the map shows the thin variant in Legend.tsx). */
export function LegendBody({ spec }: { spec: LegendSpec }) {
  if (spec.type === 'scale') {
    const u = unitConverter(spec.unit);
    const lo = spec.stops[0]![0];
    const hi = spec.stops[spec.stops.length - 1]![0];
    const pos = (v: number) => (hi === lo ? 0 : Math.min(1, Math.max(0, (v - lo) / (hi - lo))));
    const grad = `linear-gradient(to right, ${spec.stops.map(([v, c]) => `${c} ${(pos(v) * 100).toFixed(1)}%`).join(', ')})`;
    const ticks = spec.ticks;
    return (
      <div class="lg lg-scale">
        <div class="lg-bar" style={{ background: grad }} role="img" aria-label={`Farbskala ${u.fmt(lo)} bis ${u.fmt(hi)} ${u.label}`} />
        <div class="lg-ticks num">
          {ticks.map((t, i) => (
            <span
              key={t}
              class="lg-tick"
              style={{ left: `${pos(t) * 100}%` }}
              data-edge={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : undefined}
            >
              {spec.format && u.label === spec.unit ? spec.format(t) : u.fmt(t)}
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (spec.type === 'classes') {
    return (
      <ul class="lg lg-classes" role="list">
        {spec.items.map((it) => (
          <li key={it.label}>
            <span class={`lg-swatch lg-${shape(it.shape)}`} style={{ background: it.color, color: it.color }} />
            {it.label}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div class="lg lg-size">
      <ul role="list" class="lg-sizes">
        {spec.items.map((it) => (
          <li key={it.label}>
            <span class="lg-circle" style={{ width: `${Math.max(3, it.size)}px`, height: `${Math.max(3, it.size)}px`, borderColor: spec.color, background: `color-mix(in oklab, ${spec.color} 22%, transparent)` }} />
            <span class="num">{it.label}</span>
          </li>
        ))}
      </ul>
      <span class="lg-unit">{spec.unit}</span>
    </div>
  );
}
