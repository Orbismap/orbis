import { useRef, useState } from 'preact/hooks';
import { customKarten, deleteKarte, isBuiltin, isDirty, renameKarte, resetKarte, saveAs } from '../../karten/store';
import type { Karte } from '../../karten/types';
import { setActiveKarte } from '../../state/session';
import { Button } from '../../ui/Button';
import { MenuItem, MenuSeparator, Popover } from '../../ui/Popover';
import { toast } from '../../ui/toast';

type Mode = 'menu' | 'save' | 'rename';

function NameForm({ initial, action, onSubmit, onCancel }: { initial: string; action: string; onSubmit(name: string): void; onCancel(): void }) {
  const [name, setName] = useState(initial);
  return (
    <form
      class="nameform"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim());
      }}
    >
      <label class="nameform-label" for="karte-name">
        Name der Karte
      </label>
      <input id="karte-name" class="field" value={name} maxLength={40} autoFocus onFocus={(e) => (e.currentTarget as HTMLInputElement).select()} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
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

/** Menu with the actions for the active Karte (save as own, reset, rename, delete). */
export function KartenActions({ karte, open, onClose, align = 'end', up, anchor }: { karte: Karte; up?: boolean; open: boolean; onClose(): void; align?: 'start' | 'end'; anchor: { current: HTMLElement | null } }) {
  const [mode, setMode] = useState<Mode>('menu');
  const wrap = useRef<HTMLDivElement>(null);
  const builtin = isBuiltin(karte.id);
  const dirty = isDirty(karte.id);
  const close = () => {
    setMode('menu');
    onClose();
  };
  const remove = () => {
    const snapshot = structuredClone(karte);
    const idx = customKarten.value.findIndex((k) => k.id === karte.id);
    deleteKarte(karte.id);
    setActiveKarte('wetter');
    close();
    toast(`„${snapshot.name}“ gelöscht`, {
      action: {
        label: 'Rückgängig',
        run: () => {
          const list = [...customKarten.value];
          list.splice(Math.max(0, idx), 0, snapshot);
          customKarten.value = list;
          setActiveKarte(snapshot.id);
        },
      },
    });
  };
  return (
    <div ref={wrap} class="karten-actions-anchor">
      <Popover open={open} onClose={close} align={align} up={up} label="Karte" menu={mode === 'menu'} anchorRef={anchor} class="karten-pop">
        {mode === 'menu' && (
          <>
            <MenuItem icon="plus" onClick={() => setMode('save')}>
              Als eigene Karte speichern
            </MenuItem>
            {builtin && (
              <MenuItem
                icon="reset"
                disabled={!dirty}
                onClick={() => {
                  resetKarte(karte.id);
                  close();
                }}
              >
                Zurücksetzen
              </MenuItem>
            )}
            {!builtin && (
              <>
                <MenuItem icon="pencil" onClick={() => setMode('rename')}>
                  Umbenennen
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon="trash" danger onClick={remove}>
                  Karte löschen
                </MenuItem>
              </>
            )}
          </>
        )}
        {mode === 'save' && (
          <NameForm
            initial={`${karte.name} (eigene)`}
            action="Speichern"
            onCancel={close}
            onSubmit={(n) => {
              const id = saveAs(karte.id, n);
              if (id) {
                // the draft of a builtin stays with the builtin; the copy becomes the working Karte
                if (builtin) resetKarte(karte.id);
                setActiveKarte(id);
                toast(`Karte „${n}“ gespeichert`, { kind: 'ok' });
              }
              close();
            }}
          />
        )}
        {mode === 'rename' && (
          <NameForm
            initial={karte.name}
            action="Umbenennen"
            onCancel={close}
            onSubmit={(n) => {
              renameKarte(karte.id, n);
              close();
            }}
          />
        )}
      </Popover>
    </div>
  );
}
