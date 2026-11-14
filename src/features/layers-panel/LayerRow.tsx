import { isMobile } from '../../state/ui';
import { computed } from '@preact/signals';
import { useMemo, useRef } from 'preact/hooks';
import type { KarteLayer } from '../../karten/types';
import type { LayerDef } from '../../layers/types';
import { layerStatus } from '../../state/session';
import { now } from '../../state/time';
import { camera } from '../../state/view';
import { hasKey } from '../../keys';
import { setLayerVisible } from '../../karten/store';
import { Icon } from '../../ui/icons/Icon';
import { cx } from '../../ui/hooks';
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
 * One layer: a click on the row toggles it (active rows get a background), the three dots open the settings
 * (detail page). The status sits small on the right.
 */
export function LayerRow({ layer, def, karteId, from, index = 0, count = 1, onGrip, onKeyMove }: LayerRowProps) {
  const raw = layer.visible ? layerStatus.value[def.id] : undefined;
  const st = rowStatus(raw, def.cadence, now.value);
  const needsKey = raw?.needsKey;
  /** Required key that is still missing (full button with text while the layer is on). */
  const missingKey = needsKey ?? def.keys?.find((r) => r.required && !hasKey(r.id))?.id;
  /** The key button shows only while a key (required or optional) is still missing; once all are set it goes (settings manage them). */
  const keyId = missingKey ?? def.keys?.find((r) => !hasKey(r.id))?.id;
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
  else if (st.state === 'empty') sub = raw?.note?.includes('Zoomstufe') ? <span class="lrow-sub is-hint">Näher heranzoomen</span> : <span class="lrow-sub">Keine Daten</span>;
  // keep the last status line mounted while it collapses, so it slides back down smoothly
  const lastSub = useRef(sub);
  if (sub) lastSub.current = sub;
  const shownSub = sub ?? lastSub.current;
  const trail = !sub && layer.visible ? (st.state === 'ready' ? st.age : st.state === 'loading' ? 'lädt' : undefined) : undefined;
  const openPage = () => openDetail(karteId, def.id, from);

  const editing = !!onGrip;
  // in edit mode the whole row is a drag handle and a click does not toggle
  const toggle = () => !editing && setLayerVisible(karteId, def.id, !layer.visible);

  return (
    <li class={cx('lrow', layer.visible && 'is-on', st.state === 'error' && 'has-error')} data-key={def.id} onKeyDown={onKey}>
      <div class="lrow-main">
        {onGrip && (
          <button type="button" class="lrow-grip" aria-label={`${def.title} verschieben. Position ${index + 1} von ${count}. Alt plus Pfeiltasten verschiebt.`} onPointerDown={onGrip} disabled={count < 2}>
            <Icon name="grip" size={16} />
          </button>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={layer.visible}
          class={cx('lrow-head', editing && 'is-draggable')}
          data-nav
          onPointerDown={onGrip}
          title={trail && !isMobile.value ? `Stand ${trail}` : undefined}
          onClick={toggle}
        >
          <span class="lrow-badge" style={{ ['--c' as string]: def.color }} aria-hidden="true">
            <Icon name={def.icon} size={16} />
          </span>
          <span class="lrow-text">
            <span class="lrow-title">{def.title}</span>
            {shownSub && (
              <span class={cx('lrow-subw', sub && 'is-open')} aria-hidden={sub ? undefined : true}>
                <span class="lrow-subi">{shownSub}</span>
              </span>
            )}
          </span>
          {trail && <span class={cx('lrow-trail num', st.stale && 'is-stale')}>{trail}</span>}
        </button>
        {keyId && (
          <button type="button" class={cx('lrow-keybtn', !(missingKey && layer.visible) && 'is-icon')} aria-label={`Schlüssel für ${def.title}`} title={missingKey ? 'Schlüssel eintragen' : 'Schlüssel verwalten'} onClick={() => openKeySettings(keyId)}>
            <Icon name="key" size={16} />
            <span class="lrow-keybtn-text">Eintragen</span>
          </button>
        )}
        <SettingsButton def={def} onClick={openPage} />
      </div>
      {st.state === 'loading' && <span class="lrow-strip" role="progressbar" aria-label={`${def.title} lädt`} />}
    </li>
  );
}

/** Three-dots settings button that pushes the detail page of the layer. */
function SettingsButton({ def, onClick }: { def: LayerDef; onClick(): void }) {
  return (
    <button type="button" class="lrow-set" data-nav aria-haspopup="true" aria-label={`Einstellungen ${def.title}`} onClick={onClick}>
      <Icon name="more" size={16} />
    </button>
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
