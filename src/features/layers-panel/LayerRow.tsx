import { isMobile } from '../../state/ui';
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
  /** Label of the back button on the detail page ("Karte"). */
  from: string;
  index?: number;
  count?: number;
  onGrip?(e: PointerEvent): void;
  onKeyMove?(dir: -1 | 1): void;
}

/**
 * One layer: name and switch; the status sits small on the right. The settings button (and the name) push the
 * detail page of the layer.
 */
export function LayerRow({ layer, def, karteId, from, index = 0, count = 1, onGrip, onKeyMove }: LayerRowProps) {
  const raw = layer.visible ? layerStatus.value[def.id] : undefined;
  const st = rowStatus(raw, def.cadence, now.value);
  const needsKey = raw?.needsKey;
  const needsConfirm = raw?.needsConfirm;
  const below = useBelowZoom(layer.visible ? def.minZoom : undefined);
  const onKey = (e: KeyboardEvent) => {
    if (!onKeyMove || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
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
  const openPage = () => openDetail(karteId, def.id, from);

  return (
    <li class={cx('lrow', !layer.visible && 'is-off', st.state === 'error' && 'has-error')} data-key={def.id} onKeyDown={onKey}>
      <div class="lrow-main">
        {onGrip && (
          <button type="button" class="lrow-grip" aria-label={`${def.title} verschieben. Position ${index + 1} von ${count}. Alt plus Pfeiltasten verschiebt.`} onPointerDown={onGrip} disabled={count < 2}>
            <Icon name="grip" size={16} />
          </button>
        )}
        <span class="lrow-badge" style={{ ['--c' as string]: def.color }} aria-hidden="true">
          <Icon name={def.icon} size={16} />
        </span>
        <button type="button" class="lrow-head" data-nav aria-haspopup="true" aria-label={`${def.title}, Details`} title={trail && !isMobile.value ? `Stand ${trail}` : undefined} onClick={openPage}>
          <span class="lrow-text">
            <span class="lrow-title">{def.title}</span>
            {sub}
          </span>
          {trail && <span class={cx('lrow-trail num', st.stale && 'is-stale')}>{trail}</span>}
        </button>
        {isMobile.value ? (
          <SettingsButton def={def} onClick={openPage} />
        ) : (
          <button type="button" class="lrow-hide" data-nav aria-label={`${def.title} ausblenden`} title="Ausblenden" onClick={() => setLayerVisible(karteId, def.id, false)}>
            <Icon name="eye-off" size={16} />
          </button>
        )}
        {needsKey && (
          <button type="button" class="lrow-keybtn" aria-label={`Schlüssel eintragen für ${def.title}`} onClick={() => openKeySettings(needsKey)}>
            <Icon name="key" size={16} />
            Eintragen
          </button>
        )}
        <Switch class="lrow-switch" aria-label={def.title} checked={layer.visible} onChange={(v) => setLayerVisible(karteId, def.id, v)} />
      </div>
      {st.state === 'loading' && <span class="lrow-strip" role="progressbar" aria-label={`${def.title} lädt`} />}
    </li>
  );
}

/** Small settings button (sliders icon) that pushes the detail page of the layer. */
function SettingsButton({ def, onClick }: { def: LayerDef; onClick(): void }) {
  return (
    <button type="button" class="lrow-set" data-nav aria-haspopup="true" aria-label={`Einstellungen ${def.title}`} onClick={onClick}>
      <Icon name="sliders" size={16} />
    </button>
  );
}

/** Suggested layer (off): icon, name, switch. Switching on moves it up into "Aktiv". */
export function SuggestRow({ def, karteId }: { def: LayerDef; karteId: string }) {
  return (
    <li class="lrow is-suggest" data-key={def.id} onClick={() => !isMobile.peek() && setLayerVisible(karteId, def.id, true)}>
      <div class="lrow-main">
        <span class="lrow-badge" style={{ ['--c' as string]: def.color }} aria-hidden="true">
          <Icon name={def.icon} size={16} />
        </span>
        <span class="lrow-text lrow-plain">
          <span class="lrow-title">{def.title}</span>
        </span>
        <Switch class="lrow-switch" aria-label={def.title} checked={false} onChange={(v) => setLayerVisible(karteId, def.id, v)} />
      </div>
    </li>
  );
}

/**
 * One option of the field choice list (single selection, Apple HIG: list with checkmark, not a switch).
 * The chosen row also shows data age/status and the settings button.
 */
export function FieldRow({ layer, def, karteId, from, tabbable, onSelect }: { layer: KarteLayer; def: LayerDef; karteId: string; from: string; tabbable: boolean; onSelect(): void }) {
  const selected = layer.visible;
  const raw = selected ? layerStatus.value[def.id] : undefined;
  const st = rowStatus(raw, def.cadence, now.value);
  const trail = selected ? (raw?.needsKey ? 'Schlüssel nötig' : st.state === 'error' ? 'Fehler' : st.state === 'empty' ? 'Keine Daten' : st.state === 'ready' ? st.age : st.state === 'loading' ? 'lädt' : undefined) : undefined;
  return (
    <div class={cx('lrow lfield', selected && 'is-selected')} data-key={def.id}>
      <div class="lrow-main">
        <button type="button" role="radio" class="lfield-radio" data-radio aria-checked={selected} tabIndex={tabbable ? 0 : -1} onClick={onSelect}>
          <span class="lrow-badge" style={{ ['--c' as string]: def.color }} aria-hidden="true">
            <Icon name={def.icon} size={16} />
          </span>
          <span class="lrow-title">{def.title}</span>
          {trail && <span class={cx('lrow-trail num', (st.stale || st.state === 'error' || raw?.needsKey) && 'is-stale')}>{trail}</span>}
          <span class="lfield-check" aria-hidden="true">
            {selected && <Icon name="check" size={16} />}
          </span>
        </button>
        {selected && <SettingsButton def={def} onClick={() => openDetail(karteId, def.id, from)} />}
      </div>
    </div>
  );
}
