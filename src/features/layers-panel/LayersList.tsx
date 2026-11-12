import { useEffect, useRef } from 'preact/hooks';
import { cx } from '../../ui/hooks';
import { moveLayer, setLayerVisible } from '../../karten/store';
import type { Karte, KarteLayer } from '../../karten/types';
import { getLayer } from '../../layers/registry';
import type { LayerDef } from '../../layers/types';
import { activeKarte } from '../../state/session';
import { leftView } from '../../state/ui';
import { Icon } from '../../ui/icons/Icon';
import { useFlip } from './flip';
import { LayerPage } from './LayerPage';
import { FieldRow, LayerRow, SuggestRow } from './LayerRow';
import { reorderMessage, startRowDrag } from './reorder';
import { closeDetail, detailPage, isFieldAll, isSuggestAll, setFieldAll, setSuggestAll } from './themes-state';
import './layers-panel.css';

type Row = { l: KarteLayer; def: LayerDef };

/** Suggestions shown before "n weitere anzeigen". */
const SUGGEST_LIMIT = 6;
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

/** All switched-on layers of the Karte, sortable by the grip (Alt+↑/↓ from the keyboard). */
function ActiveSection({ karte, rows }: { karte: Karte; rows: Row[] }) {
  const list = useRef<HTMLUListElement>(null);
  const flipPrev = useFlip(list);
  const move = (id: string, to: number) => {
    moveLayer(karte.id, id, karte.layers.findIndex((x) => x.id === rows[to]?.l.id));
    reorderMessage.value = `${getLayer(id)?.title ?? id}, Position ${to + 1} von ${rows.length}`;
  };
  return (
    <section class="lsec">
      <h3 class="lsec-title">Aktiv</h3>
      {rows.length > 0 ? (
        <ul class="llist" role="list" ref={list} aria-label={`Aktive Ebenen in ${karte.name}`}>
          {rows.map(({ l, def }, i) => (
            <LayerRow
              key={def.id}
              layer={l}
              def={def}
              karteId={karte.id}
              from={FROM}
              index={i}
              count={rows.length}
              onGrip={(e) => startRowDrag(e, def.id, { list, flipPrev, onDrop: (id, to) => move(id, to) })}
              onKeyMove={(dir) => {
                const to = i + dir;
                if (to >= 0 && to < rows.length) move(def.id, to);
              }}
            />
          ))}
        </ul>
      ) : (
        <p class="lsec-empty">Schalte unten eine Ebene ein.</p>
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

/** Layers of the Karte's themes that are not active, grouped by theme; the first few, then "n weitere anzeigen". */
function SuggestSection({ karte, activeIds }: { karte: Karte; activeIds: Set<string> }) {
  const all = isSuggestAll(karte.id);
  const seen = new Set<string>();
  const groups = (karte.themes ?? [])
    .map((t) => ({
      id: t.id,
      title: t.title,
      rows: t.layers.filter((id) => !activeIds.has(id) && !seen.has(id) && seen.add(id)).map((id) => getLayer(id)).filter((d): d is LayerDef => !!d && !isField(d)),
    }))
    .filter((g) => g.rows.length);
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  if (total === 0) return null;
  let left = all ? Infinity : SUGGEST_LIMIT;
  const shown = groups.map((g) => ({ ...g, rows: g.rows.slice(0, Math.max(0, left)), skip: (left -= g.rows.length) })).filter((g) => g.rows.length);
  const hidden = all ? 0 : Math.max(0, total - SUGGEST_LIMIT);
  return (
    <section class="lsec">
      <h3 class="lsec-title">Passt zu dieser Karte</h3>
      {shown.map((g) => (
        <div key={g.id} class="lgrp">
          <h4 class="lgrp-title">{g.title}</h4>
          <ul class="llist" role="list" aria-label={g.title}>
            {g.rows.map((def) => (
              <SuggestRow key={def.id} def={def} karteId={karte.id} />
            ))}
          </ul>
        </div>
      ))}
      {(hidden > 0 || all) && (
        <button type="button" class="lmore" data-nav aria-expanded={all} onClick={() => setSuggestAll(karte.id, !all)}>
          {all ? 'Weniger anzeigen' : `${hidden} weitere anzeigen`}
        </button>
      )}
    </section>
  );
}

/** Left menu of the active Karte: active layers, suggestions from its themes, catalog entry, detail page (push). */
export function LayersList() {
  const k = activeKarte.value;
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

  const active = k.layers.filter((l) => l.visible).map((l) => ({ l, def: getLayer(l.id) })).filter((r): r is Row => !!r.def && !isField(r.def));
  const fieldIds = [...new Set([...(k.themes ?? []).flatMap((t) => t.layers), ...k.layers.map((l) => l.id)])];
  const fields = fieldIds.map((id) => getLayer(id)).filter((d): d is LayerDef => isField(d));
  const activeIds = new Set(active.map((r) => r.def.id));
  return (
    <div class="lnav" ref={root} onKeyDown={navKey} key="list">
      <ActiveSection karte={k} rows={active} />
      <FieldSection karte={k} fields={fields} />
      <SuggestSection karte={k} activeIds={activeIds} />
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
    </div>
  );
}
