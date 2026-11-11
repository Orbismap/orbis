import { computed } from '@preact/signals';
import { getLayer } from '../../layers/registry';
import { BASEMAPS } from '../../map/basemaps';
import { activeKarte, legends } from '../../state/session';
import { LegendBody } from './LegendBody';
import { pointerValue } from './pointer-value';
import { unitConverter } from './units';
import './legend.css';

/** Top visible field layer with a legend (at most one is mounted: field layers are exclusive). */
export const topFieldLegend = computed(() => {
  for (const l of activeKarte.value.layers) {
    if (!l.visible) continue;
    const def = getLayer(l.id);
    const spec = legends.value[l.id];
    if (def?.form === 'field' && spec) return { id: l.id, title: def.title, spec };
  }
  return null;
});

/** Map legend (bottom left): scale of the top field layer with the value under the pointer. */
export function Legend({ compact }: { compact?: boolean }) {
  const top = topFieldLegend.value;
  if (!top) return null;
  const pv = pointerValue.value;
  const marker = pv && pv.layerId === top.id ? pv.value : null;
  const k = activeKarte.value;
  const op = k.layers.find((l) => l.id === top.id)?.opacity ?? 1;
  const u = top.spec.type === 'scale' ? unitConverter(top.spec.unit) : undefined;
  return (
    <div class={compact ? 'legend legend-compact' : 'legend'} role="group" aria-label={`Legende ${top.title}`}>
      <div class="legend-head">
        <span class="legend-title">{top.title}</span>
        {u && <span class="legend-unit num">{u.label}</span>}
        {marker != null && u && (
          <span class="legend-now num" aria-live="off">
            {u.fmt(marker)}
          </span>
        )}
      </div>
      <LegendBody spec={top.spec} compact={compact} marker={marker} backdrop={BASEMAPS[k.basemap].background} fillOpacity={op} />
    </div>
  );
}
