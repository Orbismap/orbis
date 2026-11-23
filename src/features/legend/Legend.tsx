import { getLayer } from '../../layers/registry';
import type { LegendSpec } from '../../layers/types';
import { basemapDef } from '../../map/basemaps';
import { activeKarte, legends, openActive } from '../../state/session';
import { detailOpen } from '../../state/hud';
import { leftPanelOpen, leftTab, leftView, isMobile, sheetDetent } from '../../state/ui';
import { closeDetail, openDetail } from '../layers-panel/themes-state';
import { MAX_ITEMS, MAX_LEGENDS, pickTicks } from './compact';
import { pointerValue } from './pointer-value';
import { unitConverter } from './units';
import './legend.css';

interface Entry { id: string; title: string; spec: LegendSpec; opacity: number }

/** Visible layers of the active Karte that have a legend, top layer first. */
function entries(): Entry[] {
  const out: Entry[] = [];
  const lg = legends.value;
  for (const l of activeKarte.value.layers) {
    const spec = lg[l.id];
    const def = l.visible && spec ? getLayer(l.id) : undefined;
    if (def && spec) out.push({ id: l.id, title: def.title, spec, opacity: l.opacity ?? 1 });
  }
  return out;
}

function reveal(): void {
  leftView.value = 'layers';
  leftTab.value = 'layers';
  leftPanelOpen.value = true;
  detailOpen.value = true;
  if (isMobile.peek() && sheetDetent.peek() === 'peek') sheetDetent.value = 'half';
}
const openLayer = (id: string) => (reveal(), openActive(), openDetail(activeKarte.peek().id, id, 'Karte'));
const openList = () => (reveal(), closeDetail());

function ScaleRow({ e, spec }: { e: Entry; spec: Extract<LegendSpec, { type: 'scale' }> }) {
  const u = unitConverter(spec.unit);
  const lo = spec.stops[0]![0];
  const hi = spec.stops[spec.stops.length - 1]![0];
  const pos = (v: number) => (hi === lo ? 0 : Math.min(1, Math.max(0, (v - lo) / (hi - lo))));
  const grad = `linear-gradient(to right, ${spec.stops.map(([v, c]) => `${c} ${(pos(v) * 100).toFixed(1)}%`).join(', ')})`;
  const ticks = pickTicks(spec.ticks);
  const pv = pointerValue.value;
  const marker = pv && pv.layerId === e.id ? pv.value : null;
  return (
    <>
      <span class="mlg-body mlg-scale">
        <span class="mlg-bar" style={{ background: basemapDef(activeKarte.value.basemap).background }} role="img" aria-label={`Farbskala ${u.fmt(lo)} bis ${u.fmt(hi)} ${u.label}`}>
          <span class="mlg-fill" style={{ background: grad, opacity: e.opacity }} />
          {marker != null && <span class="mlg-marker" style={{ left: `${pos(marker) * 100}%` }} />}
        </span>
        <span class="mlg-ticks num" aria-hidden="true">
          {ticks.map((t, i) => (
            <span key={t} class="mlg-tick" style={{ left: `${pos(t) * 100}%` }} data-edge={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : undefined}>
              {spec.format && u.label === spec.unit ? spec.format(t) : u.fmt(t)}
            </span>
          ))}
        </span>
      </span>
      <span class="mlg-unit">{u.label}</span>
    </>
  );
}

function ItemsRow({ spec }: { spec: Exclude<LegendSpec, { type: 'scale' }> }) {
  return (
    <>
      <span class="mlg-body mlg-items">
        {spec.type === 'classes'
          ? spec.items.slice(0, MAX_ITEMS).map((it) => (
              <span class="mlg-item" key={it.label}>
                <span class={`lg-swatch lg-${it.shape ?? 'dot'}`} style={{ background: it.color, color: it.color }} />
                {it.label}
              </span>
            ))
          : spec.items.slice(0, MAX_ITEMS).map((it) => (
              <span class="mlg-item num" key={it.label}>
                <span class="lg-circle" style={{ width: `${Math.min(10, Math.max(3, it.size))}px`, height: `${Math.min(10, Math.max(3, it.size))}px`, borderColor: spec.color, background: `color-mix(in oklab, ${spec.color} 22%, transparent)` }} />
                {it.label}
              </span>
            ))}
      </span>
      <span class="mlg-unit">{spec.type === 'size' ? spec.unit : ''}</span>
    </>
  );
}

/** Map legend: one thin line per visible layer with a legend (name, colour bar with ticks, unit), at most three, the rest as "+n". */
export function Legend() {
  const all = entries();
  if (!all.length) return null;
  const shown = all.slice(0, MAX_LEGENDS);
  const more = all.length - shown.length;
  return (
    <div class="maplegend" role="group" aria-label="Legende">
      {shown.map((e) => (
        <button type="button" class={e.spec.type === 'scale' ? 'mlg-row' : 'mlg-row mlg-row-items'} key={e.id} onClick={() => openLayer(e.id)} aria-label={`Legende ${e.title}, Details öffnen`}>
          <span class="mlg-name">{e.title}</span>
          {e.spec.type === 'scale' ? <ScaleRow e={e} spec={e.spec} /> : <ItemsRow spec={e.spec} />}
        </button>
      ))}
      {more > 0 && (
        <button type="button" class="mlg-more" onClick={openList} aria-label={`${more} weitere Legenden, Ebenenliste öffnen`}>
          +{more}
        </button>
      )}
    </div>
  );
}
