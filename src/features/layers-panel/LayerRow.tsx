import { computed } from '@preact/signals';
import { useMemo } from 'preact/hooks';
import type { KarteLayer } from '../../karten/types';
import type { LayerDef } from '../../layers/types';
import { layerStatus } from '../../state/session';
import { now } from '../../state/time';
import { camera } from '../../state/view';
import { setLayerVisible } from '../../karten/store';
import { Icon } from '../../ui/icons/Icon';
import { cx } from '../../ui/hooks';
import { tipProps } from '../../ui/tip-state';
import { CADENCE_LABEL } from '../catalog/fuzzy';
import { LayerDetails } from './LayerDetails';
import { expanded, toggleExpanded } from './expanded';
import { rowStatus } from './status';

/** True while the camera is below the layer's minZoom; the row re-renders only when this flips. */
function useBelowZoom(min: number | undefined) {
  return useMemo(() => computed(() => min !== undefined && camera.value.zoom < min), [min]).value;
}

export interface LayerRowProps {
  layer: KarteLayer;
  def: LayerDef;
  karteId: string;
  index: number;
  count: number;
  onGrip(e: PointerEvent): void;
  onKeyMove(dir: -1 | 1): void;
}

export function LayerRow({ layer, def, karteId, index, count, onGrip, onKeyMove }: LayerRowProps) {
  const open = expanded.value.has(def.id);
  const st = rowStatus(layer.visible ? layerStatus.value[def.id] : undefined, def.cadence, now.value);
  const below = useBelowZoom(layer.visible ? def.minZoom : undefined);
  const onKey = (e: KeyboardEvent) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    onKeyMove(e.key === 'ArrowUp' ? -1 : 1);
  };
  let sub: preact.ComponentChild;
  if (!layer.visible) sub = <span class="lrow-sub">Ausgeblendet</span>;
  else if (below) sub = <span class="lrow-sub is-hint">Näher heranzoomen</span>;
  else if (st.state === 'error') sub = <span class="lrow-sub is-error">Fehler beim Laden</span>;
  else if (st.state === 'loading') sub = <span class="lrow-sub">Lädt</span>;
  else if (st.state === 'empty') sub = <span class="lrow-sub">Keine Daten</span>;
  else if (st.state === 'ready' && (st.count || st.age))
    sub = (
      <span class="lrow-sub num">
        {st.count}
        {st.count && st.age && ' · '}
        {st.age && <span class={st.stale ? 'is-stale' : undefined}>{st.age}</span>}
      </span>
    );
  else sub = <span class="lrow-sub">{CADENCE_LABEL[def.cadence]}</span>;

  return (
    <li class={cx('lrow', open && 'is-open', !layer.visible && 'is-off', st.state === 'error' && 'has-error')} data-key={def.id} onKeyDown={onKey}>
      <div class="lrow-main">
        <button type="button" class="lrow-grip" aria-label={`${def.title} verschieben. Position ${index + 1} von ${count}. Alt plus Pfeiltasten verschiebt.`} onPointerDown={onGrip} disabled={count < 2}>
          <Icon name="grip" size={16} />
        </button>
        <span class="lrow-badge" style={{ ['--c' as string]: def.color }} aria-hidden="true">
          <Icon name={def.icon} size={18} />
        </span>
        <button type="button" class="lrow-head" aria-expanded={open} aria-controls={`ld-${def.id}`} onClick={() => toggleExpanded(def.id)}>
          <span class="lrow-text">
            <span class="lrow-title">{def.title}</span>
            {sub}
          </span>
        </button>
        <button
          type="button"
          class="lrow-eye"
          aria-pressed={layer.visible}
          aria-label={layer.visible ? `${def.title} ausblenden` : `${def.title} einblenden`}
          onClick={() => setLayerVisible(karteId, def.id, !layer.visible)}
          {...tipProps(layer.visible ? 'Ausblenden' : 'Einblenden')}
        >
          <Icon name={layer.visible ? 'eye' : 'eye-off'} size={20} />
        </button>
        <span class="lrow-chev" aria-hidden="true">
          <Icon name="chevron-down" size={14} />
        </span>
      </div>
      {st.state === 'loading' && <span class="lrow-strip" role="progressbar" aria-label={`${def.title} lädt`} />}
      {open && <LayerDetails layer={layer} def={def} karteId={karteId} />}
    </li>
  );
}
