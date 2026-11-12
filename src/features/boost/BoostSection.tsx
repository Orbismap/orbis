import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { allKeys, keysByGroup, keySignal, setKey, type KeyDef } from '../../keys';
import { settings } from '../../state/settings';
import { settingsKeyFocus } from '../../state/ui';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/icons/Icon';
import { cx } from '../../ui/hooks';
import './boost.css';

const open = signal<Set<string>>(new Set());
const toggle = (id: string) => {
  const n = new Set(open.peek());
  if (!n.delete(id)) n.add(id);
  open.value = n;
};

function KeyRow({ def }: { def: KeyDef }) {
  const stored = keySignal(def.id).value;
  const [draft, setDraft] = useState('');
  const [shown, setShown] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const el = useRef<HTMLLIElement>(null);
  const isOpen = open.value.has(def.id);
  const url = def.kind === 'url';

  useEffect(() => {
    if (settingsKeyFocus.value !== def.id) return;
    open.value = new Set(open.peek()).add(def.id);
    settingsKeyFocus.value = null;
    requestAnimationFrame(() => el.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }, [settingsKeyFocus.value]);

  const save = () => {
    const v = draft.trim();
    if (!v) return;
    if (def.validate && !def.validate(v)) return setMsg(url ? 'Das sieht nicht nach einer gültigen Adresse aus.' : 'Das sieht nicht nach einem gültigen Schlüssel aus.');
    setKey(def.id, v);
    setDraft('');
    setMsg('');
    setShown(false);
  };

  return (
    <li class={cx('bkey', isOpen && 'is-open')} ref={el} id={`boost-${def.id}`}>
      <button type="button" class="bkey-head" aria-expanded={isOpen} onClick={() => toggle(def.id)}>
        <span class="bkey-text">
          <span class="bkey-name">{def.name}</span>
          <span class="bkey-unlocks">{def.unlocks}</span>
        </span>
        <span class={stored ? 'bkey-state is-on' : 'bkey-state'}>{stored ? 'aktiv' : 'nicht gesetzt'}</span>
        <Icon name="chevron-down" size={14} class="bkey-chev" />
      </button>
      {isOpen && (
        <div class="bkey-body">
          <ol class="bkey-steps">
            {def.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <a class="bkey-link" href={def.url} target="_blank" rel="noopener noreferrer">
            {url ? 'Mehr dazu' : 'Schlüssel bei'} {new URL(def.url).hostname.replace(/^www\./, '')}
            <Icon name="external" size={14} />
          </a>
          <form
            class="bkey-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label class="sr-only" for={`bk-${def.id}`}>
              {def.name}
            </label>
            <div class="bkey-field">
              <input
                id={`bk-${def.id}`}
                class="field"
                type={url || shown ? 'text' : 'password'}
                autocomplete="off"
                autocapitalize="off"
                spellcheck={false}
                placeholder={stored ? '••••••••  (gespeichert)' : def.placeholder ?? (url ? 'https://' : 'Schlüssel einfügen')}
                value={draft}
                onInput={(e) => {
                  setDraft((e.currentTarget as HTMLInputElement).value);
                  setMsg('');
                }}
              />
              {!url && (
                <button type="button" class="bkey-eye" aria-label={shown ? 'Eingabe verbergen' : 'Eingabe anzeigen'} aria-pressed={shown} onClick={() => setShown(!shown)}>
                  <Icon name={shown ? 'eye-off' : 'eye'} size={18} />
                </button>
              )}
            </div>
            {msg && (
              <p class="bkey-msg" role="alert">
                {msg}
              </p>
            )}
            <div class="bkey-actions">
              {stored &&
                (confirm ? (
                  <>
                    <Button variant="ghost" onClick={() => setConfirm(false)}>
                      Abbrechen
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setKey(def.id, undefined);
                        setConfirm(false);
                      }}
                    >
                      Wirklich entfernen
                    </Button>
                  </>
                ) : (
                  <Button variant="danger" onClick={() => setConfirm(true)}>
                    Entfernen
                  </Button>
                ))}
              <Button variant="primary" type="submit" disabled={!draft.trim()}>
                Speichern
              </Button>
            </div>
          </form>
        </div>
      )}
    </li>
  );
}

/** Settings section "Boost": the user's own free keys unlock further sources. Keys stay in this browser. */
export function BoostSection() {
  const groups = keysByGroup();
  const total = allKeys().length;
  const active = allKeys().filter((k) => settings.value.keys[k.id]).length;
  if (!total) return null;
  return (
    <section class="set-sec" aria-labelledby="set-boost">
      <h3 id="set-boost">
        Boost <span class="boost-count num">{active} von {total} aktiv</span>
      </h3>
      <p class="set-text boost-lead">Mit eigenen, kostenlosen Schlüsseln schaltet Orbis weitere Quellen frei. Schlüssel bleiben nur in diesem Browser.</p>
      {groups.map((g) => (
        <div key={g.group.id} class="boost-group">
          <h4>{g.group.title}</h4>
          <ul class="setgroup bkeys" role="list">
            {g.keys.map((k) => (
              <KeyRow key={k.id} def={k} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
