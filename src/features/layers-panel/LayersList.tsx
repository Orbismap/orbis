import { useEffect, useRef } from 'preact/hooks';
import { cx } from '../../ui/hooks';
import { moveLayer, removeLayer, setLayerVisible } from '../../karten/active';
import type { Karte, KarteLayer } from '../../karten/types';
import { getLayer } from '../../layers/registry';
import type { LayerDef } from '../../layers/types';
import { browsedKarte } from '../../state/session';
import { builtinKarten, universeOf } from '../../karten/standard';
import { isMobile, leftView } from '../../state/ui';
import { Icon } from '../../ui/icons/Icon';
import { useFlip } from './flip';
import { LayerPage } from './LayerPage';
import { FieldRow, LayerRow } from './LayerRow';
import { reorderMessage, startRowDrag } from './reorder';
import { applyOrder, closeDetail, detailPage, editMode, isFieldAll, menuOrder, saveOrder, setFieldAll } from './themes-state';
import './layers-panel.css';

const FIELD_LIMIT = 6;
const FROM = 'Karte';
const isField = (d: LayerDef | undefined) => d?.exclusive === 'field';

const layerOf = (k: Karte, id: string): KarteLayer => k.layers.find((l) => l.id === id) ?? { id, visible: false, opacity: 1 };

/** Arrow keys move between the focusable heads (rows, "more", catalog). */
function navKey(e: KeyboardEvent) {
  if (e.altKey || e.metaKey || e.ctrlKey || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
  const t = e.target as HTMLElement;
  if (!t.matches('[data-nav]')) return;
  const all = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-nav]'));
  const next = all[all.indexOf(t) + (e.key === 'ArrowDown' ? 1 : -1)];
  if (!next) return;
  e.preventDefault();
  next.focus();
}

interface Group { id: string; title?: string; ids: string[] }

const OTHER = '_other';

/** A standard Karte lists only the layers of its own topics (other active layers are shown in the main menu); own and unsaved Karten list all. */
const inKarte = (k: Karte) => {
  if (!k.builtin) return () => true;
  const u = universeOf(builtinKarten().find((x) => x.id === k.id) ?? k);
  return (id: string) => u.has(id);
};

/** Groups of the menu: the Karte's themes (own order applied), plus the layers that belong to no theme. */
function buildGroups(k: Karte): Group[] {
  const saved = menuOrder.value[k.id];
  const seen = new Set<string>();
  const usable = (id: string) => {
    const d = getLayer(id);
    return !!d && !isField(d);
  };
  const groups: Group[] = (k.themes ?? [])
    .map((t) => ({ id: t.id, title: t.title, ids: applyOrder(t.layers.filter((id) => usable(id) && !seen.has(id) && seen.add(id)), saved?.layers?.[t.id]) }))
    .filter((g) => g.ids.length);
  const mine = inKarte(k);
  const rest = [...new Set([...k.layers.filter((l) => usable(l.id) && !seen.has(l.id) && mine(l.id)).map((l) => l.id)])];
  if (rest.length) groups.push({ id: OTHER, title: groups.length ? 'Weitere' : undefined, ids: rest });
  return applyOrder(groups.map((g) => g.id), saved?.groups).map((id) => groups.find((g) => g.id === id)!);
}

/** One group: optional title (with grip in edit mode) and its layers; they are toggled by a click, sortable in edit mode. */
function GroupBlock({ karte, group, index, count, onGrip }: { karte: Karte; group: Group; index: number; count: number; onGrip?: (e: PointerEvent) => void }) {
  const list = useRef<HTMLUListElement>(null);
  const flipPrev = useFlip(list);
  const edit = editMode.value && !karte.builtin;
  const ids = group.ids;
  const move = (id: string, to: number) => {
    if (group.id === OTHER) moveLayer(karte.id, id, karte.layers.findIndex((x) => x.id === ids[to]));
    else {
      const next = ids.filter((x) => x !== id);
      next.splice(to, 0, id);
      saveOrder(karte.id, { group: { id: group.id, ids: next } });
    }
    reorderMessage.value = `${getLayer(id)?.title ?? id}, Position ${to + 1} von ${ids.length}`;
  };
  return (
    <div class="lgrp" data-key={group.id}>
      {group.title && (
        <div class={cx('lgrp-head', edit && 'is-draggable')} onPointerDown={edit ? onGrip : undefined}>
          {edit && onGrip && (
            <button type="button" class="lrow-grip lgrp-grip" aria-label={`Kategorie ${group.title} verschieben. Position ${index + 1} von ${count}.`} disabled={count < 2}>
              <Icon name="grip" size={16} />
            </button>
          )}
          <h4 class="lgrp-title">{group.title}</h4>
        </div>
      )}
      <ul class="llist" role="list" ref={list} aria-label={group.title ?? `Ebenen in ${karte.name}`}>
        {ids.map((id, i) => {
          const def = getLayer(id)!;
          return (
            <LayerRow
              key={id}
              layer={layerOf(karte, id)}
              def={def}
              karteId={karte.id}
              from={FROM}
              index={i}
              count={ids.length}
              onGrip={edit ? (e) => startRowDrag(e, id, { list, flipPrev, onDrop: (key, to) => move(key, to) }) : undefined}
              onKeyMove={edit ? (dir) => i + dir >= 0 && i + dir < ids.length && move(id, i + dir) : undefined}
              onRemove={edit ? () => removeLayer(karte.id, id) : undefined}
            />
          );
        })}
      </ul>
    </div>
  );
}

/** All layers of the Karte, grouped by category. Active rows stay in place (background only); groups are sortable in edit mode. */
function MenuSection({ karte, groups }: { karte: Karte; groups: Group[] }) {
  const box = useRef<HTMLDivElement>(null);
  const flipPrev = useFlip(box);
  const moveGroup = (id: string, to: number) => {
    const next = groups.map((g) => g.id).filter((x) => x !== id);
    next.splice(to, 0, id);
    saveOrder(karte.id, { groups: next });
    reorderMessage.value = `${groups.find((g) => g.id === id)?.title ?? 'Ebenen'}, Position ${to + 1} von ${groups.length}`;
  };
  return (
    <section class="lsec">
      {groups.length > 0 ? (
        <div class="lgroups" ref={box}>
          {groups.map((g, i) => (
            <GroupBlock
              key={g.id}
              karte={karte}
              group={g}
              index={i}
              count={groups.length}
              onGrip={(e) => startRowDrag(e, g.id, { list: box, flipPrev, onDrop: moveGroup })}
            />
          ))}
        </div>
      ) : (
        <p class="lsec-empty">Noch keine Ebenen. Füge unten eine hinzu.</p>
      )}
      <div class="sr-only" role="status" aria-live="polite">
        {reorderMessage.value}
      </div>
    </section>
  );
}

/** Field layers (exclusive): single-selection list with checkmark, first row "Kein Feld". */
function FieldSection({ karte, fields }: { karte: Karte; fields: LayerDef[] }) {
  const all = isFieldAll(karte.id);
  if (fields.length === 0) return null;
  const sel = fields.find((d) => layerOf(karte, d.id).visible);
  const limited = !all && fields.length > FIELD_LIMIT;
  const shown = limited ? fields.filter((d, i) => i < FIELD_LIMIT || d.id === sel?.id) : fields;
  const hidden = fields.length - shown.length;
  const choose = (id: string | null) => {
    if (id) setLayerVisible(karte.id, id, true);
    else for (const d of fields) if (layerOf(karte, d.id).visible) setLayerVisible(karte.id, d.id, false);
  };
  const onKey = (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir || e.altKey || e.metaKey || e.ctrlKey) return;
    const t = e.target as HTMLElement;
    if (!t.matches('[data-radio]')) return;
    const radios = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-radio]'));
    const next = radios[(radios.indexOf(t) + dir + radios.length) % radios.length];
    if (!next) return;
    e.preventDefault();
    next.focus();
    next.click();
  };
  return (
    <section class="lsec">
      <h3 class="lsec-title" id={`lfield-${karte.id}`}>
        Feld
      </h3>
      <div class="llist" role="radiogroup" aria-labelledby={`lfield-${karte.id}`} onKeyDown={onKey}>
        <div class={cx('lrow lfield', !sel && 'is-selected')}>
          <div class="lrow-main">
            <button type="button" role="radio" class="lfield-radio" data-radio aria-checked={!sel} tabIndex={!sel ? 0 : -1} onClick={() => choose(null)}>
              <span class="lrow-badge lfield-none" aria-hidden="true">
                <Icon name="eye-off" size={16} />
              </span>
              <span class="lrow-title">Kein Feld</span>
              <span class="lfield-check" aria-hidden="true">
                {!sel && <Icon name="check" size={16} />}
              </span>
            </button>
          </div>
        </div>
        {shown.map((def) => (
          <FieldRow key={def.id} layer={layerOf(karte, def.id)} def={def} karteId={karte.id} from={FROM} tabbable={sel?.id === def.id} onSelect={() => choose(def.id)} />
        ))}
      </div>
      {(hidden > 0 || (all && fields.length > FIELD_LIMIT)) && (
        <button type="button" class="lmore" data-nav aria-expanded={all} onClick={() => setFieldAll(karte.id, !all)}>
          {all ? 'Weniger anzeigen' : `${hidden} weitere anzeigen`}
        </button>
      )}
    </section>
  );
}

/** Left menu of the active Karte: active layers, suggestions from its themes, catalog entry, detail page (push). */
export function LayersList() {
  const k = browsedKarte.value;
  const detail = detailPage.value;
  const root = useRef<HTMLDivElement>(null);
  const was = useRef<string | null>(null);

  const page = detail && detail.karteId === k.id ? getLayer(detail.layerId) : undefined;
  useEffect(() => {
    if (page) was.current = page.id;
    else if (was.current) {
      const id = was.current;
      was.current = null;
      root.current?.querySelector<HTMLElement>(`[data-key="${id}"] .lrow-head, [data-key="${id}"] .lrow-set, [data-key="${id}"] [data-radio]`)?.focus({ preventScroll: true });
    }
  }, [page?.id]);
  useEffect(() => {
    if (detail && !page) closeDetail();
  }, [detail, page]);

  const inThemes = new Set((k.themes ?? []).flatMap((t) => t.layers));
  if (page && detail) {
    return (
      <div class="lnav lnav-page" key={`page-${page.id}`}>
        <LayerPage layer={layerOf(k, page.id)} def={page} karteId={k.id} from={detail.from} removable={!inThemes.has(page.id)} />
      </div>
    );
  }

  const mine = inKarte(k);
  const fieldIds = [...new Set([...(k.themes ?? []).flatMap((t) => t.layers), ...k.layers.map((l) => l.id)])].filter(mine);
  const fields = fieldIds.map((id) => getLayer(id)).filter((d): d is LayerDef => isField(d));
  return (
    <div class="lnav" ref={root} onKeyDown={navKey} key="list">
      <MenuSection karte={k} groups={buildGroups(k)} />
      <FieldSection karte={k} fields={fields} />
      {editMode.value && !k.builtin && !isMobile.value && (
        <button type="button" class="ladd" data-nav onClick={() => (leftView.value = 'catalog')}>
          <span class="lrow-badge ladd-badge" aria-hidden="true">
            <Icon name="plus" size={16} />
          </span>
          <span class="ladd-text">Ebene hinzufügen</span>
        </button>
      )}
      {isMobile.value && (
      <section class="lsec">
        <h3 class="lsec-title">Alle Ebenen</h3>
        <button type="button" class="ladd" data-nav onClick={() => (leftView.value = 'catalog')}>
          <span class="lrow-badge ladd-badge" aria-hidden="true">
            <Icon name="search" size={16} />
          </span>
          <span class="ladd-text">Katalog durchsuchen</span>
          <span class="lrow-chev" aria-hidden="true">
            <Icon name="chevron-right" size={14} />
          </span>
        </button>
      </section>
      )}
    </div>
  );
}
