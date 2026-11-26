import { customPage } from './pages/registry';
import { isMobile } from '../../state/ui';
import { computed } from '@preact/signals';
import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { KarteLayer } from '../../karten/types';
import type { LayerDef } from '../../layers/types';
import { layerStatus } from '../../state/session';
import { now } from '../../state/time';
import { camera } from '../../state/view';
import { hasKey } from '../../keys';
import { setLayerVisible } from '../../karten/active';
import { useEscape } from '../../ui/hooks';
import { Popover } from '../../ui/Popover';
import { multiValues } from '../../layers/multi';
import { OptionFields, shownOptions } from './LayerDetails';
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
  /** Edit mode: takes the layer out of this Karte. */
  onRemove?(): void;
}

/**
 * One layer: a click on the row toggles it (active rows get a background), the three dots open the settings
 * (detail page). The status sits small on the right.
 */
export function LayerRow({ layer, def, karteId, from, index = 0, count = 1, onGrip, onKeyMove, onRemove }: LayerRowProps) {
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
    <li class={cx('lrow', layer.visible && 'is-on', editing && 'is-editing', st.state === 'error' && 'has-error')} data-key={def.id} onKeyDown={onKey}>
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
        <span class="lrow-fill" aria-hidden="true" onPointerDown={onGrip} onClick={toggle}>
          {!editing && <span class="lrow-opts">{optionSummary(def, layer)}</span>}
        </span>
        {/* one button per row: the filter (its popup ends in "Einstellungen") or, without options, the gear */}
        {editing && onRemove && (
          <button type="button" class="lrow-set" aria-label={`${def.title} aus der Karte entfernen`} onClick={onRemove}>
            <Icon name="close" size={16} />
          </button>
        )}
        {editing ? null : hasChoices(def) ? <FilterButton def={def} layer={layer} karteId={karteId} onSettings={openPage} /> : <SettingsButton def={def} onClick={openPage} />}
      </div>
      {st.state === 'loading' && <span class="lrow-strip" role="progressbar" aria-label={`${def.title} lädt`} />}
    </li>
  );
}

/** Three-dots settings button that pushes the detail page of the layer. */
function SettingsButton({ def, onClick }: { def: LayerDef; onClick(): void }) {
  return (
    <button type="button" class="lrow-set" data-nav aria-haspopup="true" aria-label={`Einstellungen ${def.title}`} style={{ ['--c' as string]: def.color }} onClick={onClick}>
      <Icon name="gear" size={16} />
    </button>
  );
}

/**
 * One option of the field choice list (single selection, Apple HIG: list with checkmark, not a switch).
 * The chosen row also shows data age/status and the settings button.
 */
export function FieldRow({ layer, def, karteId, from, tabbable, onSelect, onRemove }: { layer: KarteLayer; def: LayerDef; karteId: string; from: string; tabbable: boolean; onSelect(): void; /** Edit mode: takes the layer out of this Karte. */ onRemove?(): void }) {
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
        {onRemove && (
          <button type="button" class="lrow-set" aria-label={`${def.title} aus der Karte entfernen`} onClick={onRemove}>
            <Icon name="close" size={16} />
          </button>
        )}
        {selected && !onRemove && (hasChoices(def) ? <FilterButton def={def} layer={layer} karteId={karteId} onSettings={() => openDetail(karteId, def.id, from)} /> : <SettingsButton def={def} onClick={() => openDetail(karteId, def.id, from)} />)}
      </div>
    </div>
  );
}

/** Layers with a select or a toggle option get the filter button. */
const hasChoices = (def: LayerDef) => !!def.options?.some((o) => o.type === 'select' || o.type === 'multi' || o.type === 'toggle');

/** Short text of the chosen options: the labels of the select choices (toggle labels are too long for a row). */
function optionSummary(def: LayerDef, layer: KarteLayer): string {
  const parts: string[] = [];
  for (const o of shownOptions(def, layer)) {
    const v = layer.options?.[o.id] ?? o.default;
    if (o.type === 'select') parts.push(o.choices.find((c) => c.value === v)?.label ?? String(v));
    else if (o.type === 'multi') {
      const list = multiValues(v);
      parts.push(list ? list.map((x) => o.choices.find((c) => c.value === x)?.label ?? x).join(', ') : o.choices.find((c) => c.value === 'all')?.label ?? 'Alle');
    }
  }
  return parts.join(' · ').replace(/OpenStreetMap/g, 'OSM');
}

/** Filter button: opens a small popup with the options of the layer, right at the row. */
function FilterButton({ def, layer, karteId, onSettings }: { def: LayerDef; layer: KarteLayer; karteId: string; onSettings(): void }) {
  const [pos, setPos] = useState<{ top: number; right: number; up?: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const open = pos !== null;
  const close = () => setPos(null);
  const phone = isMobile.value; // there the shared popover is an action sheet and closes itself
  useEscape(open && !phone, close);
  // not enough room below the row: open upwards instead (anchored at the bottom edge, so the height does not matter)
  useLayoutEffect(() => {
    if (!pos || pos.up !== undefined || !pop.current || !btn.current) return;
    const h = pop.current.getBoundingClientRect().height;
    const r = btn.current.getBoundingClientRect();
    if (pos.top + h > window.innerHeight - 8 && r.top > window.innerHeight - r.bottom) setPos({ ...pos, up: window.innerHeight - r.top + 6 });
  }, [pos]);
  useEffect(() => {
    if (!open || phone) return;
    const on = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    document.addEventListener('pointerdown', on, true);
    window.addEventListener('resize', close);
    // scrolling the list (or anything else) moves the row away from the popup: close it
    const onScroll = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('wheel', onScroll as EventListener, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('wheel', onScroll as EventListener, true);
      document.removeEventListener('pointerdown', on, true);
      window.removeEventListener('resize', close);
    };
  }, [open, phone]);
  const toggle = () => {
    if (open) return close();
    const r = btn.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right - 4) });
  };
  const body = (
    <>
      <OptionFields layer={layer} def={def} karteId={karteId} />
      <button type="button" class="lrow-pop-foot" onClick={() => { close(); onSettings(); }}>
        <Icon name="gear" size={16} />
        Einstellungen
      </button>
    </>
  );
  return (
    <>
      <button ref={btn} type="button" class={cx('lrow-filter', open && 'is-open')} data-nav aria-haspopup="dialog" aria-expanded={open} aria-label={`Optionen ${def.title}`} title="Optionen" onClick={toggle}>
        <Icon name={customPage(def.id) ? 'sliders' : 'filter'} size={16} />
      </button>
      {phone && (
        <Popover open={open} onClose={close} label={def.title} class="lrow-pop" anchorRef={btn}>
          {body}
        </Popover>
      )}
      {!phone && open &&
        createPortal(
          <div ref={pop} class="popover lrow-pop" role="dialog" aria-label={`Optionen ${def.title}`} style={pos.up !== undefined ? { position: 'fixed', bottom: `${pos.up}px`, top: 'auto', right: `${pos.right}px`, left: 'auto', transformOrigin: 'bottom right' } : { position: 'fixed', top: `${pos.top}px`, right: `${pos.right}px`, left: 'auto' }}>
            {body}
          </div>,
          document.body,
        )}
    </>
  );
}
