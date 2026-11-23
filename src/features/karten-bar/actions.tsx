import { useRef, useState } from 'preact/hooks';
import { serializeHash } from '../../core/url';
import { activeKarteId, openKarte, SCRATCH_ID, setActiveIds, setActiveKarte } from '../../karten/active';
import { DEFAULT_KARTE_ID } from '../../karten/standard';
import { createKarte, customKarten, deleteKarte, isBuiltin, listedKarten, saveAs, setKarteView, updateKarteMeta } from '../../karten/store';
import type { Karte } from '../../karten/types';
import { activeKarte, browsedKarte } from '../../state/session';
import { camera } from '../../state/view';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/hooks';
import { Icon } from '../../ui/icons/Icon';
import type { IconName } from '../../ui/icons/names';
import { MenuItem, MenuSeparator, Popover } from '../../ui/Popover';
import { leftView } from '../../state/ui';
import { toast } from '../../ui/toast';
import { editMode } from '../layers-panel/themes-state';

const ICONS: IconName[] = ['pin', 'map', 'globe', 'layers', 'cloud', 'plane', 'ship', 'camera', 'leaf', 'mountain', 'drop', 'flame', 'bolt', 'sun', 'moon', 'people'];
const COLORS = ['#72C8F0', '#FF6B5E', '#F2B45A', '#58D0A0', '#C0A0FF', '#A58BFF', '#FF8FB8', '#8FDCFF'];

/** Name, icon and colour of a Karte. */
export function NameForm({ initial, icon: icon0, color: color0, action, onSubmit, onCancel }: { initial: string; icon: IconName; color: string; action: string; onSubmit(v: { name: string; icon: IconName; color: string }): void; onCancel(): void }) {
  const [name, setName] = useState(initial);
  const [icon, setIcon] = useState(icon0);
  const [color, setColor] = useState(color0);
  return (
    <form
      class="nameform"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit({ name: name.trim(), icon, color });
      }}
    >
      <label class="nameform-label" for="karte-name">
        Name der Karte
      </label>
      <input id="karte-name" class="field" value={name} maxLength={40} autoFocus onFocus={(e) => (e.currentTarget as HTMLInputElement).select()} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
      <div class="nameform-picks" role="radiogroup" aria-label="Symbol">
        {ICONS.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={icon === n} aria-label={n} class={cx('nameform-pick', icon === n && 'is-on')} onClick={() => setIcon(n)}>
            <Icon name={n} size={16} />
          </button>
        ))}
      </div>
      <div class="nameform-picks" role="radiogroup" aria-label="Farbe">
        {COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} class={cx('nameform-pick', 'nameform-color', color === c && 'is-on')} style={{ '--c': c }} onClick={() => setColor(c)} />
        ))}
      </div>
      <div class="nameform-actions">
        <Button variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button variant="primary" type="submit" disabled={!name.trim()}>
          {action}
        </Button>
      </div>
    </form>
  );
}

/** "Sichern als Karte": saves what the unsaved Karte shows as an own Karte and opens it. */
export function saveAsKarte(source: Karte, v: { name: string; icon: IconName; color: string }): void {
  const id = saveAs(source, v.name, v);
  setActiveKarte(id);
  toast(`Karte „${v.name}“ gespeichert`, { kind: 'ok' });
}

async function copyLink(k: Karte): Promise<void> {
  const url = `${location.origin}${location.pathname}${serializeHash({ layers: k.layers.filter((l) => l.visible).map((l) => l.id), shared: { name: k.name, icon: k.icon, color: k.color, basemap: k.basemap } })}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Link kopiert', { kind: 'ok' });
  } catch {
    toast('Link konnte nicht kopiert werden', { kind: 'error' });
  }
}

/** Deletes an own Karte (leaving it, if it was open) with an undo toast. */
export function removeKarte(k: Karte): void {
  const snapshot = structuredClone(k);
  const idx = customKarten.peek().findIndex((x) => x.id === k.id);
  const wasOpen = activeKarteId.peek() === k.id;
  deleteKarte(k.id);
  editMode.value = false;
  if (wasOpen) (setActiveKarte(DEFAULT_KARTE_ID), setActiveIds([]));
  toast(`„${snapshot.name}“ gelöscht`, {
    action: {
      label: 'Rückgängig',
      run: () => {
        const next = [...customKarten.peek()];
        next.splice(Math.max(0, idx), 0, snapshot);
        customKarten.value = next;
        if (wasOpen) setActiveKarte(snapshot.id);
      },
    },
  });
}

type View = { kind: 'list' } | { kind: 'actions'; id: string } | { kind: 'rename'; id: string } | { kind: 'delete'; id: string };

/**
 * "Alle Karten": standard Karten (a catalog), own Karten and "Neue Karte". Own Karten have a "⋯" with their actions.
 * Own popover state, so desktop (tab bar) and mobile (switcher) share it.
 */
export function KartenPopover({ open, onClose, anchor, align = 'end', up, class: cls, style, only, onPicked }: { open: boolean; onClose(): void; anchor: { current: HTMLElement | null }; align?: 'start' | 'end'; up?: boolean; class?: string; style?: Record<string, string | number>; /** Only the actions of this Karte (no list). */ only?: string; onPicked?(id: string): void }) {
  const home = (): View => (only ? { kind: 'actions', id: only } : { kind: 'list' });
  const [view, setView] = useState<View>(home);
  const list = listedKarten.value;
  const active = browsedKarte.value;
  const close = () => {
    setView(home());
    onClose();
  };
  const pick = (id: string) => {
    openKarte(id);
    close();
    onPicked?.(id);
  };
  const remove = (k: Karte) => {
    removeKarte(k);
    close();
  };
  const duplicate = (k: Karte) => {
    setActiveKarte(saveAs(k, `${k.name} (Kopie)`));
    toast(`„${k.name}“ dupliziert`, { kind: 'ok' });
    close();
  };
  const row = (k: Karte) => (
    <div key={k.id} class="kall-row">
      <button type="button" role="menuitemradio" aria-checked={k.id === active.id} class="menuitem kall-item" onClick={() => pick(k.id)}>
        <span class="menuitem-icon">
          <Icon name={k.icon} size={16} />
        </span>
        <span class="menuitem-label">{k.name}</span>
        {k.id === active.id && <Icon name="check" size={16} />}
      </button>
      {!isBuiltin(k.id) && (
        <button type="button" role="menuitem" class="kall-more" aria-haspopup="menu" aria-label={`Aktionen für ${k.name}`} onClick={() => setView({ kind: 'actions', id: k.id })}>
          <Icon name="more" size={16} />
        </button>
      )}
    </div>
  );
  const target = 'id' in view ? list.find((k) => k.id === view.id) : undefined;
  return (
    <Popover open={open} onClose={close} align={align} up={up} label={only ? 'Kartenaktionen' : 'Alle Karten'} menu={view.kind === 'list' || view.kind === 'actions'} anchorRef={anchor} style={style} class={cx('kbar-all', cls)}>
      {view.kind === 'list' && (
        <>
          <div role="group" aria-label="Standardkarten">
            <div class="kall-head" aria-hidden="true">
              Standardkarten
            </div>
            {list.filter((k) => isBuiltin(k.id)).map(row)}
          </div>
          {list.some((k) => !isBuiltin(k.id)) && (
            <div role="group" aria-label="Eigene Karten">
              <div class="kall-head" aria-hidden="true">
                Eigene Karten
              </div>
              {list.filter((k) => !isBuiltin(k.id)).map(row)}
            </div>
          )}
          <MenuSeparator />
          <MenuItem
            icon="plus"
            onClick={() => {
              pick(createKarte());
            }}
          >
            Neue Karte
          </MenuItem>
        </>
      )}
      {view.kind === 'actions' && target && (
        <>
          {only ? (
            <div class="kall-head" aria-hidden="true">
              {target.name}
            </div>
          ) : (
            <button type="button" class="kall-back" onClick={() => setView({ kind: 'list' })}>
              <Icon name="chevron-left" size={14} />
              <span>{target.name}</span>
            </button>
          )}
          <MenuItem icon="pencil" onClick={() => setView({ kind: 'rename', id: target.id })}>
            {target.name} umbenennen
          </MenuItem>
          <MenuItem icon="plus" onClick={() => (leftView.value = 'catalog')}>
            Ebene hinzufügen
          </MenuItem>
          <MenuItem
            icon="pin"
            onClick={() => {
              const c = camera.peek();
              setKarteView(target.id, { center: [c.lng, c.lat], zoom: c.zoom });
              toast(`Position für „${target.name}“ gespeichert`, { kind: 'ok' });
              close();
            }}
          >
            {target.view ? 'Position aktualisieren' : 'Position speichern'}
          </MenuItem>
          {target.view && (
            <MenuItem
              icon="trash"
              onClick={() => {
                setKarteView(target.id, undefined);
                close();
              }}
            >
              Position entfernen
            </MenuItem>
          )}
          <MenuItem icon="copy" onClick={() => duplicate(target)}>
            Duplizieren
          </MenuItem>
          <MenuItem
            icon="link"
            onClick={() => {
              void copyLink(target);
              close();
            }}
          >
            Link kopieren
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon="trash" danger onClick={() => setView({ kind: 'delete', id: target.id })}>
            Karte löschen
          </MenuItem>
        </>
      )}
      {view.kind === 'rename' && target && (
        <NameForm
          initial={target.name}
          icon={target.icon}
          color={target.color}
          action="Sichern"
          onCancel={() => setView({ kind: 'actions', id: target.id })}
          onSubmit={(v) => {
            updateKarteMeta(target.id, v);
            close();
          }}
        />
      )}
      {view.kind === 'delete' && target && (
        <div class="nameform">
          <p class="kall-confirm">„{target.name}“ wirklich löschen?</p>
          <div class="nameform-actions">
            <Button variant="ghost" onClick={() => setView({ kind: 'actions', id: target.id })}>
              Abbrechen
            </Button>
            <Button variant="destructive" icon="trash" onClick={() => remove(target)}>
              Löschen
            </Button>
          </div>
        </div>
      )}
    </Popover>
  );
}

/** Slim row shown while the layers on the map belong to no standard Karte (the unsaved Karte): save them as an own Karte, or clear them. */
/** `short`: the Karte name is already shown above (desktop detail menu), so the text stays short. */
export function KartenChangeRow({ short }: { short?: boolean } = {}) {
  const k = activeKarte.value;
  const show = k.id === SCRATCH_ID;
  const [saving, setSaving] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  return (
    <div class="kchange" ref={wrap} data-open={show} {...(show ? {} : ({ inert: '' } as object))}>
      <div class="kchange-clip">
        <div class="kchange-row" role="status">
          <span class="kchange-text">{short ? 'Nicht gespeichert' : 'Ungespeicherte Karte'}</span>
          <button type="button" class="kchange-btn is-primary" onClick={() => setSaving(true)}>
            Als Karte sichern
          </button>
          <button type="button" class="kchange-btn" onClick={() => setActiveIds([])}>
            Leeren
          </button>
        </div>
      </div>
      <Popover open={saving && show} onClose={() => setSaving(false)} align="end" label="Als Karte sichern" anchorRef={wrap} class="karten-pop">
        <NameForm
          initial="Neue Karte"
          icon="pin"
          color="#A58BFF"
          action="Sichern"
          onCancel={() => setSaving(false)}
          onSubmit={(v) => {
            setSaving(false);
            saveAsKarte(k, v);
          }}
        />
      </Popover>
    </div>
  );
}
