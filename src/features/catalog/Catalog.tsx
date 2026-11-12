import { computed } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { addLayer, removeLayer, setLayerVisible } from '../../karten/store';
import { allLayers, layersByCategory } from '../../layers/registry';
import type { LayerDef } from '../../layers/types';
import { activeKarte } from '../../state/session';
import { isMobile, leftView } from '../../state/ui';
import { IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons/Icon';
import { cx } from '../../ui/hooks';
import { VirtualList } from '../../ui/VirtualList';
import { settings } from '../../state/settings';
import { matchSnippet, scoreLayer } from './fuzzy';
import './catalog.css';

type IconName = Parameters<typeof Icon>[0]['name'];
type Item =
  | { kind: 'head'; id: string; title: string; icon: IconName; count: number }
  | { kind: 'sub'; id: string; title: string }
  | { kind: 'row'; id: string; def: LayerDef; snippet?: string };

const membership = computed(() => new Map(activeKarte.value.layers.map((l) => [l.id, l.visible])));

function toggle(def: LayerDef) {
  const k = activeKarte.peek();
  const m = membership.peek().get(def.id);
  if (m === undefined) {
    // exclusive field layers replace the current one
    if (def.exclusive) {
      const byId = new Map(allLayers().map((d) => [d.id, d]));
      for (const l of k.layers) if (l.id !== def.id && byId.get(l.id)?.exclusive === def.exclusive) removeLayer(k.id, l.id);
    }
    addLayer(k.id, def.id);
  } else if (m) removeLayer(k.id, def.id);
  else setLayerVisible(k.id, def.id, true);
}

function KeyMark({ def }: { def: LayerDef }) {
  const have = settings.value.keys;
  if (!def.keys?.length) return null;
  if (def.keys.some((r) => r.required)) {
    const ok = def.keys.every((r) => !r.required || have[r.id]);
    return (
      <span class={cx('crow-key', ok && 'is-ok')} title={ok ? 'Schlüssel hinterlegt' : 'Benötigt einen Schlüssel'}>
        <Icon name="key" size={12} />
        <span class="sr-only">{ok ? 'Schlüssel hinterlegt' : 'benötigt Schlüssel'}</span>
      </span>
    );
  }
  return def.keys.some((r) => !have[r.id]) ? (
    <span class="crow-key" title="Mit Schlüssel genauer">
      <Icon name="boost" size={12} />
      <span class="sr-only">mit Schlüssel genauer</span>
    </span>
  ) : null;
}

function Row({ def, active, state, snippet, onPick }: { def: LayerDef; active: boolean; state: boolean | undefined; snippet?: string; onPick(): void }) {
  const area = def.coverage && def.coverage !== 'Welt' ? def.coverage : undefined;
  return (
    <div
      id={`cat-${def.id}`}
      role="option"
      aria-selected={state === true}
      title={def.summary}
      class={cx('crow', active && 'is-active', state && 'is-on', snippet && 'has-snippet')}
      onClick={onPick}
    >
      <span class="crow-icon" style={{ ['--c' as string]: def.color }}>
        <Icon name={def.icon} size={14} />
      </span>
      <span class="crow-text">
        <span class="crow-line">
          <span class="crow-title">{def.title}</span>
          {area && <span class="crow-area">{area}</span>}
          <KeyMark def={def} />
        </span>
        {snippet && <span class="crow-snippet">{snippet}</span>}
      </span>
      <span class="crow-state" aria-hidden="true">
        {state === true ? <Icon name="check" size={16} /> : state === false ? <Icon name="eye-off" size={16} /> : <Icon name="plus" size={16} />}
      </span>
      <span class="sr-only">{state === true ? 'in der Karte' : state === false ? 'ausgeblendet' : 'hinzufügen'}</span>
    </div>
  );
}

export function Catalog() {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const mem = membership.value;

  useEffect(() => {
    if (!isMobile.peek()) input.current?.focus();
  }, []);

  const items = useMemo<Item[]>(() => {
    if (q.trim()) {
      return allLayers()
        .map((def) => ({ def, s: scoreLayer(def, q) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s || a.def.title.localeCompare(b.def.title, 'de'))
        .map((r): Item => ({ kind: 'row', id: r.def.id, def: r.def, snippet: matchSnippet(r.def, q) }));
    }
    return layersByCategory().flatMap((g): Item[] => {
      const fields = g.layers.filter((d) => d.exclusive === 'field');
      const rest = g.layers.filter((d) => d.exclusive !== 'field');
      const row = (def: LayerDef): Item => ({ kind: 'row', id: def.id, def });
      return [
        { kind: 'head', id: `h-${g.category.id}`, title: g.category.title, icon: g.category.icon, count: g.layers.length },
        ...(fields.length ? [{ kind: 'sub', id: `s-f-${g.category.id}`, title: 'Felder · eines gleichzeitig' } as Item, ...fields.map(row)] : []),
        ...(fields.length && rest.length ? [{ kind: 'sub', id: `s-r-${g.category.id}`, title: 'Weitere' } as Item] : []),
        ...rest.map(row),
      ];
    });
  }, [q]);

  const rowIdx = useMemo(() => items.map((it, i) => (it.kind === 'row' ? i : -1)).filter((i) => i >= 0), [items]);
  const a = Math.min(active, Math.max(0, rowIdx.length - 1));
  const activeItem = items[rowIdx[a] ?? -1];
  const move = (d: number) => setActive((Math.min(Math.max(0, a + d), rowIdx.length - 1)));

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), move(1));
    else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1));
    else if (e.key === 'Home') (e.preventDefault(), setActive(0));
    else if (e.key === 'End') (e.preventDefault(), setActive(rowIdx.length - 1));
    else if (e.key === 'Enter' && activeItem?.kind === 'row') (e.preventDefault(), toggle(activeItem.def));
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (q) setQ('');
      else leftView.value = 'layers';
    }
  };

  return (
    <div class="cat">
      <div class="cat-head">
        <IconButton icon="chevron-left" label="Zurück zu den Ebenen" onClick={() => (leftView.value = 'layers')} />
        <h2 class="cat-title">Ebene hinzufügen</h2>
        <span class="cat-count num">{allLayers().length}</span>
      </div>
      <div class="cat-search">
        <Icon name="search" size={16} />
        <input
          ref={input}
          class="cat-input"
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls="cat-list"
          aria-activedescendant={activeItem?.kind === 'row' ? `cat-${activeItem.id}` : undefined}
          aria-label="Ebenen durchsuchen"
          placeholder="Ebenen durchsuchen"
          autocomplete="off"
          spellcheck={false}
          value={q}
          onInput={(e) => {
            setQ((e.currentTarget as HTMLInputElement).value);
            setActive(0);
          }}
          onKeyDown={onKey}
        />
      </div>
      {items.length === 0 ? (
        <div class="cat-empty" role="status">
          <p>
            Keine Ebene zu „{q}“.
          </p>
          <button type="button" class="linkbtn" onClick={() => setQ('')}>
            Suche zurücksetzen
          </button>
        </div>
      ) : (
        <div id="cat-list" role="listbox" aria-multiselectable="true" aria-label="Ebenen" class="cat-list">
          <VirtualList
            class="cat-scroll"
            items={items}
            rowHeight={(it) => (it.kind === 'head' ? 36 : it.kind === 'sub' ? 24 : (isMobile.value ? 44 : 36) + (it.snippet ? 16 : 0))}
            itemKey={(it) => it.id}
            scrollToIndex={rowIdx[a]}
            render={(it, i) =>
              it.kind === 'head' ? (
                <div class="chead" role="presentation">
                  <Icon name={it.icon} size={14} />
                  <span>{it.title}</span>
                  <span class="num chead-n">{it.count}</span>
                </div>
              ) : it.kind === 'sub' ? (
                <div class="csub" role="presentation">
                  {it.title}
                </div>
              ) : (
                <Row def={it.def} snippet={it.snippet} active={i === rowIdx[a]} state={mem.get(it.def.id)} onPick={() => (setActive(rowIdx.indexOf(i)), toggle(it.def))} />
              )
            }
          />
        </div>
      )}
    </div>
  );
}
