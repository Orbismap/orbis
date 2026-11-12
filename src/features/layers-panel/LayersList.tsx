import { useEffect, useRef } from 'preact/hooks';
import { moveLayer } from '../../karten/store';
import type { Karte, KarteLayer, KarteTheme } from '../../karten/types';
import { getLayer } from '../../layers/registry';
import type { LayerDef } from '../../layers/types';
import { activeKarte } from '../../state/session';
import { leftView } from '../../state/ui';
import { Icon } from '../../ui/icons/Icon';
import { cx } from '../../ui/hooks';
import { useFlip } from './flip';
import { LayerPage } from './LayerPage';
import { LayerRow } from './LayerRow';
import { reorderMessage, startRowDrag } from './reorder';
import { closeDetail, detailPage, isThemeOpen, setThemeOpen } from './themes-state';
import './layers-panel.css';

const OWN = 'Eigene Ebenen';
type Row = { l: KarteLayer; def: LayerDef };

const layerOf = (k: Karte, id: string): KarteLayer => k.layers.find((l) => l.id === id) ?? { id, visible: false, opacity: 1 };

/** Arrow keys move between topic headers and rows; Right/Left open and close a topic (like a sidebar). */
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

function ThemeSection({ karte, theme, firstId }: { karte: Karte; theme: KarteTheme; firstId: string }) {
  const open = isThemeOpen(karte.id, theme.id, firstId);
  const rows = theme.layers.map((id) => ({ l: layerOf(karte, id), def: getLayer(id) })).filter((r): r is Row => !!r.def);
  const on = rows.filter((r) => r.l.visible).length;
  const exclusive = rows.filter((r) => r.def.exclusive).length > 1;
  const set = (v: boolean) => setThemeOpen(karte.id, theme.id, v, firstId);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' && !open) (e.preventDefault(), set(true));
    else if (e.key === 'ArrowLeft' && open) (e.preventDefault(), set(false));
  };
  return (
    <section class={cx('ltheme', open && 'is-open')}>
      <button type="button" class="ltheme-head" data-nav aria-expanded={open} aria-controls={`lt-${karte.id}-${theme.id}`} onClick={() => set(!open)} onKeyDown={onKey}>
        <span class="lrow-badge" style={{ ['--c' as string]: karte.color }} aria-hidden="true">
          <Icon name={theme.icon} size={18} />
        </span>
        <span class="ltheme-title">{theme.title}</span>
        <span class={cx('ltheme-count num', on > 0 && 'is-on')}>{on > 0 ? `${on} von ${rows.length}` : rows.length}</span>
        <span class="lrow-chev" aria-hidden="true">
          <Icon name="chevron-down" size={14} />
        </span>
      </button>
      {open && (
        <div class="ltheme-body" id={`lt-${karte.id}-${theme.id}`}>
          {exclusive && <p class="ltheme-hint">Nur ein Feld gleichzeitig.</p>}
          <ul class="llist" role="list" aria-label={theme.title}>
            {rows.map(({ l, def }) => (
              <LayerRow key={def.id} layer={l} def={def} karteId={karte.id} from={theme.title} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Own layers: not part of a topic (added from the catalog). Sortable by the grip, Alt+↑/↓ from the keyboard. */
function OwnLayers({ karte, rows, titled }: { karte: Karte; rows: Row[]; titled: boolean }) {
  const list = useRef<HTMLUListElement>(null);
  const flipPrev = useFlip(list);
  const move = (id: string, to: number) => {
    moveLayer(karte.id, id, karte.layers.findIndex((x) => x.id === rows[to]?.l.id));
    reorderMessage.value = `${getLayer(id)?.title ?? id}, Position ${to + 1} von ${rows.length}`;
  };
  return (
    <section class="lown">
      {(titled || rows.length > 0) && <h3 class="lown-title">{OWN}</h3>}
      {rows.length > 0 && (
        <ul class="llist lgroup" role="list" ref={list} aria-label={`${OWN} in ${karte.name}`}>
          {rows.map(({ l, def }, i) => (
            <LayerRow
              key={def.id}
              layer={l}
              def={def}
              karteId={karte.id}
              from={OWN}
              own
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
      )}
      {rows.length === 0 && !titled && <p class="lown-empty">Diese Karte ist leer. Ebenen zeigen, was gerade passiert: Wetter, Erdbeben, Flugzeuge, Seekabel.</p>}
      <button type="button" class="ladd" data-nav onClick={() => (leftView.value = 'catalog')}>
        <span class="lrow-badge ladd-badge" aria-hidden="true">
          <Icon name="plus" size={18} />
        </span>
        <span>Ebene hinzufügen</span>
      </button>
      <div class="sr-only" role="status" aria-live="polite">
        {reorderMessage.value}
      </div>
    </section>
  );
}

/** Left menu of the active Karte: topic list with expandable topics, "Eigene Ebenen", detail page (push). */
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
      root.current?.querySelector<HTMLElement>(`[data-key="${id}"] .lrow-head`)?.focus({ preventScroll: true });
    }
  }, [page?.id]);
  useEffect(() => {
    if (detail && !page) closeDetail();
  }, [detail, page]);

  if (page && detail) {
    const inTheme = k.themes?.some((t) => t.layers.includes(page.id));
    return (
      <div class="lnav lnav-page" key={`page-${page.id}`}>
        <LayerPage layer={layerOf(k, page.id)} def={page} karteId={k.id} from={detail.from} removable={!inTheme} />
      </div>
    );
  }

  const themes = k.themes ?? [];
  const inThemes = new Set(themes.flatMap((t) => t.layers));
  const own = k.layers.filter((l) => !inThemes.has(l.id)).map((l) => ({ l, def: getLayer(l.id) })).filter((r): r is Row => !!r.def);
  return (
    <div class="lnav" ref={root} onKeyDown={navKey} key="list">
      {themes.map((t) => (
        <ThemeSection key={t.id} karte={k} theme={t} firstId={themes[0]!.id} />
      ))}
      <OwnLayers karte={k} rows={own} titled={themes.length > 0} />
    </div>
  );
}
