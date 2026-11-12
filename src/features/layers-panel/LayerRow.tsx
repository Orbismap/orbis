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
import { Switch } from '../../ui/Switch';
import { openKeySettings } from '../boost/open';
import { LayerDetails } from './LayerDetails';
import { expanded, toggleExpanded } from './expanded';
import { settingsMode } from './mode';
import { rowStatus } from './status';
import { openDetail } from './themes-state';

/** True while the camera is below the layer's minZoom; the row re-renders only when this flips. */
function useBelowZoom(min: number | undefined) {
  return useMemo(() => computed(() => min !== undefined && camera.value.zoom < min), [min]).value;
}

export interface LayerRowProps {
  layer: KarteLayer;
  def: LayerDef;
  karteId: string;
  /** Label of the back button on the detail page (topic title or "Eigene Ebenen"). */
  from: string;
  /** Own layer: sortable and removable. */
  own?: boolean;
  index?: number;
  count?: number;
  onGrip?(e: PointerEvent): void;
  onKeyMove?(dir: -1 | 1): void;
}

/**
 * One layer: name and switch; the status sits small on the right. Settings: inline in the row (arrow down) or,
 * for layers with many options, on a detail page (arrow right), see settingsMode.
 */
export function LayerRow({ layer, def, karteId, from, own, index = 0, count = 1, onGrip, onKeyMove }: LayerRowProps) {
  const mode = settingsMode(def);
  const open = mode === 'inline' && expanded.value.has(def.id);
  const raw = layer.visible ? layerStatus.value[def.id] : undefined;
  const st = rowStatus(raw, def.cadence, now.value);
  const needsKey = raw?.needsKey;
  const needsConfirm = raw?.needsConfirm;
  const below = useBelowZoom(layer.visible ? def.minZoom : undefined);
  const onKey = (e: KeyboardEvent) => {
    if (!own || !onKeyMove || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    onKeyMove(e.key === 'ArrowUp' ? -1 : 1);
  };
  let sub: preact.ComponentChild = null;
  if (needsKey) sub = <span class="lrow-sub is-hint">Schlüssel nötig</span>;
  else if (needsConfirm) sub = <span class="lrow-sub is-hint">Bestätigung nötig</span>;
  else if (below) sub = <span class="lrow-sub is-hint">Näher heranzoomen</span>;
  else if (st.state === 'error') sub = <span class="lrow-sub is-error">Fehler beim Laden</span>;
  else if (st.state === 'empty') sub = <span class="lrow-sub">Keine Daten</span>;
  const trail = !sub && layer.visible ? (st.state === 'ready' ? st.age : st.state === 'loading' ? 'lädt' : undefined) : undefined;
  const toggleOpen = () => (mode === 'inline' ? toggleExpanded(def.id) : openDetail(karteId, def.id, from));
  const headAria = mode === 'inline' ? { 'aria-expanded': open, 'aria-controls': `ld-${def.id}` } : { 'aria-haspopup': 'true' as const };

  return (
    <li class={cx('lrow', open && 'is-open', !layer.visible && 'is-off', st.state === 'error' && 'has-error')} data-key={def.id} onKeyDown={onKey}>
      <div class="lrow-main">
        {own && (
          <button type="button" class="lrow-grip" aria-label={`${def.title} verschieben. Position ${index + 1} von ${count}. Alt plus Pfeiltasten verschiebt.`} onPointerDown={onGrip} disabled={count < 2}>
            <Icon name="grip" size={16} />
          </button>
        )}
        <span class="lrow-badge" style={{ ['--c' as string]: def.color }} aria-hidden="true">
          <Icon name={def.icon} size={18} />
        </span>
        <button type="button" class="lrow-head" data-nav {...headAria} aria-label={`${def.title}, Einstellungen`} onClick={toggleOpen}>
          <span class="lrow-text">
            <span class="lrow-title">{def.title}</span>
            {sub}
          </span>
          {trail && <span class={cx('lrow-trail num', st.stale && 'is-stale')}>{trail}</span>}
          <span class={cx('lrow-chev', mode === 'page' && 'is-push')} aria-hidden="true">
            <Icon name={mode === 'page' ? 'chevron-right' : 'chevron-down'} size={14} />
          </span>
        </button>
        {needsKey && (
          <button type="button" class="lrow-keybtn" aria-label={`Schlüssel eintragen für ${def.title}`} onClick={() => openKeySettings(needsKey)}>
            <Icon name="key" size={16} />
            Eintragen
          </button>
        )}
        <Switch class="lrow-switch" aria-label={def.title} checked={layer.visible} onChange={(v) => setLayerVisible(karteId, def.id, v)} />
      </div>
      {st.state === 'loading' && <span class="lrow-strip" role="progressbar" aria-label={`${def.title} lädt`} />}
      {open && <LayerDetails layer={layer} def={def} karteId={karteId} removable={own} onMore={() => openDetail(karteId, def.id, from)} />}
    </li>
  );
}
