import { useRef, useState } from 'preact/hooks';
import { serializeHash } from '../../core/url';
import { createKarte, customKarten, deleteKarte, discardChanges, drafts, isBuiltin, isDirty, karten, resetKarte, restoreDraft, saveAs, updateKarteMeta } from '../../karten/store';
import type { Karte } from '../../karten/types';
import { activeKarte, setActiveKarte } from '../../state/session';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/hooks';
import { Icon } from '../../ui/icons/Icon';
import type { IconName } from '../../ui/icons/names';
import { MenuItem, MenuSeparator, Popover } from '../../ui/Popover';
import { toast } from '../../ui/toast';

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

/** "Sichern als Karte": creates an own Karte from the current state, switches to it and returns the standard Karte to its start. */
export function saveAsKarte(source: Karte, v: { name: string; icon: IconName; color: string }): void {
  const id = saveAs(source.id, v.name, v);
  if (!id) return;
  if (isBuiltin(source.id)) resetKarte(source.id);
  setActiveKarte(id);
  toast(`Karte „${v.name}“ gespeichert`, { kind: 'ok' });
}

/** Removes the rebuild of a standard Karte (with undo). */
export function discardKarte(karte: Karte): void {
  const before = discardChanges(karte.id);
  if (before) toast(`Änderungen an „${karte.name}“ verworfen`, { action: { label: 'Rückgängig', run: () => restoreDraft(karte.id, before) } });
}

async function copyLink(id: string): Promise<void> {
  const url = `${location.origin}${location.pathname}${serializeHash({ karte: id })}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Link kopiert', { kind: 'ok' });
  } catch {
    toast('Link konnte nicht kopiert werden', { kind: 'error' });
  }
}

type View = { kind: 'list' } | { kind: 'actions'; id: string } | { kind: 'rename'; id: string } | { kind: 'delete'; id: string };

/**
 * "Alle Karten": standard Karten, own Karten and "Neue Karte". Every row has a "⋯" with the actions for its type.
 * Own popover state, so desktop (tab bar) and mobile (switcher) share it.
 */
export function KartenPopover({ open, onClose, anchor, align = 'end', up, class: cls, style, only, onPicked }: { open: boolean; onClose(): void; anchor: { current: HTMLElement | null }; align?: 'start' | 'end'; up?: boolean; class?: string; style?: Record<string, string | number>; /** Only the actions of this Karte (no list). */ only?: string; onPicked?(id: string): void }) {
  const home = (): View => (only ? { kind: 'actions', id: only } : { kind: 'list' });
  const [view, setView] = useState<View>(home);
  const list = karten.value;
  const active = activeKarte.value;
  const close = () => {
    setView(home());
    onClose();
  };
  const pick = (id: string) => {
    setActiveKarte(id);
    close();
    onPicked?.(id);
  };
  const remove = (k: Karte) => {
    const snapshot = structuredClone(k);
    const idx = customKarten.value.findIndex((x) => x.id === k.id);
    deleteKarte(k.id);
    if (active.id === k.id) setActiveKarte('wetter');
    close();
    toast(`„${snapshot.name}“ gelöscht`, {
      action: {
        label: 'Rückgängig',
        run: () => {
          const next = [...customKarten.value];
          next.splice(Math.max(0, idx), 0, snapshot);
          customKarten.value = next;
          setActiveKarte(snapshot.id);
        },
      },
    });
  };
  const duplicate = (k: Karte) => {
    const id = saveAs(k.id, `${k.name} (Kopie)`);
    if (id) {
      setActiveKarte(id);
      toast(`„${k.name}“ als eigene Karte dupliziert`, { kind: 'ok' });
    }
    close();
  };
  const row = (k: Karte) => (
    <div key={k.id} class="kall-row">
      <button type="button" role="menuitemradio" aria-checked={k.id === active.id} class="menuitem kall-item" onClick={() => pick(k.id)}>
        <span class="menuitem-icon">
          <Icon name={k.icon} size={16} />
        </span>
        <span class="menuitem-label">{k.name}</span>
        {isDirty(k.id) && <span class="kbar-dirty" role="img" aria-label="geändert" />}
        {k.id === active.id && <Icon name="check" size={16} />}
      </button>
      <button type="button" role="menuitem" class="kall-more" aria-haspopup="menu" aria-label={`Aktionen für ${k.name}`} onClick={() => setView({ kind: 'actions', id: k.id })}>
        <Icon name="more" size={16} />
      </button>
    </div>
  );
  const target = 'id' in view ? list.find((k) => k.id === view.id) : undefined;
  const builtin = target ? isBuiltin(target.id) : false;
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
          {builtin ? (
            <MenuItem
              icon="reset"
              disabled={!drafts.value[target.id]}
              onClick={() => {
                const before = drafts.peek()[target.id];
                resetKarte(target.id);
                close();
                toast(`„${target.name}“ auf Startansicht zurückgesetzt`, { action: { label: 'Rückgängig', run: () => restoreDraft(target.id, before) } });
              }}
            >
              Auf Startansicht zurücksetzen
            </MenuItem>
          ) : (
            <MenuItem icon="pencil" onClick={() => setView({ kind: 'rename', id: target.id })}>
              Umbenennen, Symbol und Farbe
            </MenuItem>
          )}
          <MenuItem icon="plus" onClick={() => duplicate(target)}>
            Duplizieren als eigene Karte
          </MenuItem>
          <MenuItem
            icon="link"
            onClick={() => {
              void copyLink(target.id);
              close();
            }}
          >
            Link kopieren
          </MenuItem>
          {!builtin && (
            <>
              <MenuSeparator />
              <MenuItem icon="trash" danger onClick={() => setView({ kind: 'delete', id: target.id })}>
                Karte löschen
              </MenuItem>
            </>
          )}
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

/** Slim row under the tab bar: shown only when the active standard Karte was really rebuilt. */
/** `short`: the Karte name is already shown above (desktop detail menu), so just "Angepasst". */
export function KartenChangeRow({ short }: { short?: boolean } = {}) {
  const k = activeKarte.value;
  const show = isDirty(k.id);
  const [saving, setSaving] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const name = useRef(k.name);
  if (show) name.current = k.name;
  return (
    <div class="kchange" ref={wrap} data-open={show} {...(show ? {} : ({ inert: '' } as object))}>
      <div class="kchange-clip">
        <div class="kchange-row" role="status">
          <span class="kchange-text">{short ? "Angepasst" : `${name.current} angepasst`}</span>
          <button type="button" class="kchange-btn is-primary" onClick={() => setSaving(true)}>
            Sichern als Karte
          </button>
          <button type="button" class="kchange-btn" onClick={() => discardKarte(k)}>
            Verwerfen
          </button>
        </div>
      </div>
        <Popover open={saving && show} onClose={() => setSaving(false)} align="end" label="Sichern als Karte" anchorRef={wrap} class="karten-pop">
          <NameForm
            initial={`${k.name} (eigene)`}
            icon={k.icon}
            color={k.color}
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
