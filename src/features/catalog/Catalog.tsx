import { computed } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { addLayer, removeLayer, setLayerVisible } from '../../karten/store';
import { categoryById } from '../../layers/categories';
import { allLayers, layersByCategory } from '../../layers/registry';
import type { LayerDef } from '../../layers/types';
import { activeKarte } from '../../state/session';
import { isMobile, leftView } from '../../state/ui';
import { Chip } from '../../ui/Chip';
import { IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons/Icon';
import { cx } from '../../ui/hooks';
import { VirtualList } from '../../ui/VirtualList';
import { CADENCE_LABEL, scoreLayer } from './fuzzy';
import './catalog.css';

type Item = { kind: 'head'; id: string; title: string; icon: Parameters<typeof Icon>[0]['name']; count: number } | { kind: 'row'; id: string; def: LayerDef; cat?: string };

const membership = computed(() => new Map(activeKarte.value.layers.map((l) => [l.id, l.visible])));

function toggle(def: LayerDef) {
  const k = activeKarte.peek();
  const m = membership.peek().get(def.id);
  if (m === undefined) addLayer(k.id, def.id);
  else if (m) removeLayer(k.id, def.id);
  else setLayerVisible(k.id, def.id, true);
}

function Row({ def, active, state, showCat, onPick }: { def: LayerDef; active: boolean; state: boolean | undefined; showCat?: string; onPick(): void }) {
  return (
    <div
      id={`cat-${def.id}`}
      role="option"
      aria-selected={state === true}
      class={cx('crow', active && 'is-active', state && 'is-on')}
      onClick={onPick}
      onMouseMove={undefined}
    >
      <span class="crow-icon" style={{ ['--c' as string]: def.color }}>
        <Icon name={def.icon} size={18} />
      </span>
      <span class="crow-text">
        <span class="crow-line">
          <span class="crow-title">{def.title}</span>
          <Chip>{CADENCE_LABEL[def.cadence]}</Chip>
          {def.coverage && def.coverage !== 'Welt' && <Chip>{def.coverage}</Chip>}
        </span>
        <span class="crow-summary">{showCat ? `${showCat}: ` : ''}{def.summary}</span>
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
        .map((r): Item => ({ kind: 'row', id: r.def.id, def: r.def, cat: categoryById(r.def.category).title }));
    }
    return layersByCategory().flatMap((g): Item[] => [
      { kind: 'head', id: `h-${g.category.id}`, title: g.category.title, icon: g.category.icon, count: g.layers.length },
      ...g.layers.map((def): Item => ({ kind: 'row', id: def.id, def })),
    ]);
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
            rowHeight={(it) => (it.kind === 'head' ? 36 : 52)}
            itemKey={(it) => it.id}
            scrollToIndex={rowIdx[a]}
            render={(it, i) =>
              it.kind === 'head' ? (
                <div class="chead" role="presentation">
                  <Icon name={it.icon} size={14} />
                  <span>{it.title}</span>
                  <span class="num chead-n">{it.count}</span>
                </div>
              ) : (
                <Row def={it.def} showCat={it.cat} active={i === rowIdx[a]} state={mem.get(it.def.id)} onPick={() => (setActive(rowIdx.indexOf(i)), toggle(it.def))} />
              )
            }
          />
        </div>
      )}
    </div>
  );
}
