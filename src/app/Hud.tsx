import { getLayer } from '../layers/registry';
import { createPortal } from 'preact/compat';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { localResults, placeResult } from '../features/search/results';
import { placeQuery } from '../features/search/tags';
import { orderResults, usePlaces } from '../features/search/Search';
import type { Result } from '../features/search/sources';
import { clearHistory, history, type HistoryEntry, type HistoryKind } from '../state/history';
import { flyToPoint } from '../features/shared/map';
import { openDetail } from '../features/layers-panel/themes-state';
import { selectCard, setProbe } from '../state/selection';
import { InspectorCard } from '../features/inspector/Inspector';
import { KartenChangeRow, KartenPopover, NameForm, removeKarte, saveAsKarte } from '../features/karten-bar/actions';
import { detailPage, editMode } from '../features/layers-panel/themes-state';
import { PlaceCard } from '../features/place/PlaceCard';
import { ProbeCard } from '../features/probe/ProbeCard';
import '../features/karten-bar/karten-bar.css';
import { SCRATCH_ID, activeIds, openActive, openKarte, setActiveIds, setLayerVisible } from '../karten/active';
import { createKarte, karten, listedKarten, moveKarteTo } from '../karten/store';
import { clearSelection, inspector, place, probe, selectPlace } from '../state/selection';
import { activeKarte, browsedKarte } from '../state/session';
import { RoutePanel } from '../features/routes/RoutePanel';
import { SavedPlaces } from '../features/routes/SavedPlaces';
import { closeKarteDetail, orteView, detailOpen, detailVisible, hudSearchFocus, HUD_DETAIL_W, HUD_GAP, HUD_MAIN_DEFAULT, hudMainWidth, setHudMainWidth } from '../state/hud';
import { leftPanelOpen, leftView } from '../state/ui';
import { Button, IconButton } from '../ui/Button';
import { SettingsView } from '../features/settings/Settings';
import { cx } from '../ui/hooks';
import { Kbd } from '../ui/Chip';
import { Icon } from '../ui/icons/Icon';
import { Panel } from '../ui/Panel';
import { ScrollArea } from '../ui/ScrollArea';
import { flyToPlace } from '../features/search/results';
import { useFlip } from '../features/layers-panel/flip';
import { startRowDrag } from '../features/layers-panel/reorder';
import { MenuItem, Popover } from '../ui/Popover';
import { OrbisMark } from '../ui/brand/OrbisMark';
import { Catalog } from '../features/catalog/Catalog';
import { LeftBody } from './LeftBody';
import { isMobile } from '../state/ui';
import './hud.css';

function pickKarte(id: string) {
  clearSelection();
  orteView.value = null;
  leftView.value = 'layers';
  openKarte(id);
  detailOpen.value = true;
}

/** Click on an active layer in the main menu: opens its page in the detail menu. */
function openActiveLayer(layerId: string) {
  clearSelection();
  orteView.value = null;
  leftView.value = 'layers';
  openActive();
  detailOpen.value = true;
  openDetail(activeKarte.peek().id, layerId, 'Karte');
}

const FILTERS: { id: HistoryKind; label: string }[] = [
  { id: 'layer', label: 'Ebenen' },
  { id: 'object', label: 'Objekte' },
  { id: 'place', label: 'Orte' },
  { id: 'search', label: 'Suchen' },
];

function openEntry(e: HistoryEntry) {
  if (e.kind === 'layer' && e.layerId) {
    const id = e.karteId && karten.peek().some((k) => k.id === e.karteId) ? e.karteId : activeKarte.peek().id;
    pickKarte(id);
    openDetail(id, e.layerId, 'Karte');
  } else if (e.kind === 'object' && e.layerId && e.card) {
    selectCard(e.layerId, e.card);
    if (e.lng !== undefined && e.lat !== undefined) flyToPoint(e.lng, e.lat, 9);
  } else if (e.kind === 'search' && e.lng !== undefined && e.lat !== undefined) {
    selectPlace({ id: e.key.slice(2), title: e.title, subtitle: e.sub === 'Suche' ? '' : (e.sub ?? ''), lng: e.lng, lat: e.lat, kind: e.placeKind });
    flyToPlace(e.bounds, e.lng, e.lat);
  } else if (e.kind === 'place' && e.lng !== undefined && e.lat !== undefined) {
    setProbe({ lng: e.lng, lat: e.lat });
    flyToPoint(e.lng, e.lat, 9);
  }
}

/** "Zuletzt": layers, objects and points of the history, filterable by chips. */
function Recents() {
  const [on, setOn] = useState<HistoryKind[]>([]);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const menuEl = useRef<HTMLDivElement>(null);
  // the menu is portalled out of the blurred panel (a nested backdrop blur does not render), so "outside" spans both
  const both = { get current() { return { contains: (n: Node) => !!(anchor.current?.contains(n) || menuEl.current?.contains(n)) } as HTMLElement; } };
  const r = open ? anchor.current?.getBoundingClientRect() : undefined;
  const all = history.value;
  const list = all.filter((e) => on.length === 0 || on.includes(e.kind)).slice(0, 12);
  if (all.length === 0) return null;
  return (
    <section class="hud-recent" aria-label="Zuletzt">
      <div class="hud-secthead">
        <h2 class="hud-sect">Zuletzt</h2>
        <div class="hud-filter" ref={anchor}>
          <button type="button" class="hud-filterbtn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
            {on.length ? `Filter · ${on.length}` : 'Filter'}
            <Icon name="chevron-down" size={12} />
          </button>
          {r &&
            createPortal(
              <div ref={menuEl} class="hud-filterwrap" style={{ top: `${r.bottom + 6}px`, right: `${window.innerWidth - r.right}px` }}>
            <Popover open={open} onClose={() => setOpen(false)} align="end" label="Verlauf filtern" anchorRef={both} menu class="hud-filtermenu">
              {FILTERS.map((f) => (
              <button key={f.id} type="button" role="menuitemcheckbox" aria-checked={on.includes(f.id)} class="menuitem" onClick={() => setOn(on.includes(f.id) ? on.filter((x) => x !== f.id) : [...on, f.id])}>
                <span class="menuitem-label">{f.label}</span>
                {on.includes(f.id) && <Icon name="check" size={14} />}
              </button>
            ))}
            </Popover>
              </div>,
              document.body,
            )}
        </div>
      </div>
      {list.length === 0 ? (
        <p class="hud-none">Nichts in dieser Auswahl</p>
      ) : (
        <ul class="hud-rows" role="list">
          {list.map((e) => (
            <li key={e.key}>
              <button type="button" class="hud-row hud-row-2" onClick={() => openEntry(e)}>
                <span class="hud-badge">
                  <Icon name={e.icon} size={18} />
                </span>
                <span class="hud-rt2">
                  <b>{e.title}</b>
                  {e.sub && <small>{e.sub}</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" class="hud-clear" onClick={clearHistory}>
        Verlauf löschen
      </button>
    </section>
  );
}

/** Section heading with a small options button (settings icon) and its menu. `children` gets `close` and `form` (true: the popup holds a form, not menu items). */
function SectHead({ title, label, children }: { title: string; label: string; children(api: { close(): void; form(on: boolean): void; formOn: boolean }): preact.ComponentChildren }) {
  const [open, setOpen] = useState(false);
  const [formOn, setForm] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const menuEl = useRef<HTMLDivElement>(null);
  const both = { get current() { return { contains: (n: Node) => !!(anchor.current?.contains(n) || menuEl.current?.contains(n)) } as HTMLElement; } };
  const r = open ? anchor.current?.getBoundingClientRect() : undefined;
  const close = () => (setOpen(false), setForm(false));
  return (
    <div class="hud-secthead">
      <h2 class="hud-sect">{title}</h2>
      <div class="hud-filter" ref={anchor}>
        <button type="button" class="hud-filterbtn hud-optbtn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
          <Icon name="sliders" size={14} />
        </button>
        {r &&
          createPortal(
            <div ref={menuEl} class="hud-filterwrap" style={{ top: `${r.bottom + 6}px`, right: `${window.innerWidth - r.right}px` }}>
              <Popover open={open} onClose={close} align="end" label={label} anchorRef={both} menu={!formOn} class="hud-filtermenu">
                {children({ close, form: setForm, formOn })}
              </Popover>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}

/** "Aktive Ebenen": options menu (save the active layers as an own Karte, switch all off). */
function ActiveHead() {
  return (
    <SectHead title="Aktive Ebenen" label="Optionen für aktive Ebenen">
      {({ close, form, formOn }) =>
        formOn ? (
          <NameForm
            initial="Neue Karte"
            icon="pin"
            color="#A58BFF"
            action="Sichern"
            onCancel={() => form(false)}
            onSubmit={(v) => {
              const k = activeKarte.peek();
              saveAsKarte({ ...k, layers: k.layers.filter((l) => l.visible) }, v);
              close();
            }}
          />
        ) : (
          <>
            <MenuItem icon="plus" onClick={() => form(true)}>
              Als Karte sichern
            </MenuItem>
            <MenuItem
              icon="eye-off"
              onClick={() => {
                setActiveIds([]);
                close();
              }}
            >
              Alle ausschalten
            </MenuItem>
          </>
        )
      }
    </SectHead>
  );
}

const KARTEN_SHOWN = 5;

/** Main menu: search and the list of Karten. */
function MainPanel() {
  const all = listedKarten.value;
  const active = browsedKarte.value;
  const working = activeKarte.value;
  const activeLayers = activeIds.value;
  const [more, setMore] = useState(false);
  const [sorting, setSorting] = useState(false);
  const kList = useRef<HTMLUListElement>(null);
  const flipPrev = useFlip(kList);
  const [q, setQ] = useState('');
  const [sel, setActive] = useState(0);
  const [popOpen, setPopOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLLabelElement>(null);
  const places = usePlaces(placeQuery(q));
  const searching = q.trim().length > 0;
  const results = useMemo<Result[]>(() => {
    if (!q.trim()) return [];
    const all = [...localResults(q).filter((r) => r.group === 'Koordinate'), ...(placeQuery(q).length >= 2 ? places.places.map(placeResult) : [])];
    return orderResults(all);
  }, [q, places.places]);
  const a = Math.min(sel, Math.max(0, results.length - 1));
  const fr = searching && popOpen ? field.current?.getBoundingClientRect() : undefined;
  const loadingPlaces = places.status === 'loading' && q.trim().length >= 2;
  useEffect(() => {
    if (!hudSearchFocus.value) return;
    const id = setTimeout(() => (input.current?.focus(), input.current?.select()), 0);
    return () => clearTimeout(id);
  }, [hudSearchFocus.value]);
  useEffect(() => document.getElementById(`hr-${a}`)?.scrollIntoView({ block: 'nearest' }), [a, results]);
  // a press anywhere else (map, other menu) closes the results; the typed text stays in the field
  useEffect(() => {
    if (!searching || !popOpen) return;
    const on = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!field.current?.contains(t) && !t.closest('.hud-sres')) setPopOpen(false);
    };
    document.addEventListener('pointerdown', on, true);
    return () => document.removeEventListener('pointerdown', on, true);
  }, [searching, popOpen]);
  const run = (r: Result | undefined) => {
    if (!r) return;
    setQ(r.title);
    setPopOpen(false);
    input.current?.blur();
    r.run();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a + 1) % Math.max(1, results.length)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a - 1 + results.length) % Math.max(1, results.length)));
    else if (e.key === 'Enter') (e.preventDefault(), run(results[a]));
    else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), popOpen && searching ? setPopOpen(false) : input.current?.blur());
  };
  let last: string | undefined;
  const rows = results.map((r, i) => {
    const head = r.group !== last ? <h2 class="hud-sect">{r.group}</h2> : null;
    last = r.group;
    return (
      <div key={r.id}>
        {head}
        <button type="button" id={`hr-${i}`} role="option" aria-selected={i === a} class="hud-row hud-row-2" onMouseMove={() => i !== a && setActive(i)} onClick={() => run(r)}>
          <span class="hud-badge">
            <Icon name={r.icon} size={18} />
          </span>
          <span class="hud-rt2">
            <b>{r.title}</b>
            {r.subtitle && <small>{r.subtitle}</small>}
          </span>
        </button>
      </div>
    );
  });
  // the first five stay visible; the rest and "Neue Karte" sit behind "Mehr anzeigen"
  const expanded = more || sorting;
  const list = expanded ? all : all.slice(0, KARTEN_SHOWN);
  const showing = detailVisible.value && leftView.value !== 'settings' && !inspector.value && !probe.value && !orteView.value;
  return (
    <Panel as="section" class="hudm" aria-label="Orbis Karten">
      <header class="hudm-head">
        <h1>
          <OrbisMark size={32} variant="small" />
          Orbis Karten
        </h1>
        <IconButton icon="panel-left" label="Menü ausblenden" shortcut="mod+B" class="hud-rbtn" onClick={() => (leftPanelOpen.value = false)} />
      </header>
      <label class="hudm-search" ref={field}>
        <Icon name="search" size={15} />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={searching && popOpen}
          aria-controls="hud-results"
          aria-activedescendant={searching && popOpen && results.length ? `hr-${a}` : undefined}
          aria-label="Ort oder Koordinate suchen"
          aria-keyshortcuts="Meta+F Control+F"
          placeholder="Ort suchen"
          autocomplete="off"
          spellcheck={false}
          value={q}
          onInput={(e) => (setQ((e.currentTarget as HTMLInputElement).value), setActive(0), setPopOpen(true))}
          onFocus={() => setPopOpen(true)}
          onKeyDown={onKey}
        />
        {q ? (
          <button type="button" class="hudm-clear" aria-label="Eingabe löschen" onClick={() => (setQ(''), input.current?.focus())}>
            <Icon name="close" size={14} />
          </button>
        ) : (
          <Kbd keys="mod+F" />
        )}
      </label>
      {fr &&
        createPortal(
          <div class="popover hud-sres" style={{ left: `${fr.left}px`, top: `${fr.bottom + 6}px`, width: `${fr.width}px`, maxHeight: `${window.innerHeight - fr.bottom - 18}px` }}>
            <div id="hud-results" role="listbox" aria-label="Ergebnisse">
            {rows}
            {loadingPlaces && <p class="hud-none">Orte werden gesucht</p>}
            {places.status === 'error' && <p class="hud-none">Ortssuche nicht erreichbar.</p>}
            {!loadingPlaces && results.length === 0 && <p class="hud-none">Keine Treffer zu „{q.trim()}“</p>}
          </div>
          </div>,
          document.body,
        )}
      <ScrollArea class="hudm-scroll">
        <h2 class="hud-sect hud-sect-first">Orte</h2>
        <ul class="hud-rows" role="list" aria-label="Orte">
          {([['places', 'bookmark', 'Gespeicherte Orte'], ['routes', 'route', 'Routen']] as const).map(([id, icon, label]) => (
            <li key={id}>
              <button type="button" class="hud-row" aria-current={orteView.value === id ? 'true' : undefined} onClick={() => (clearSelection(), (orteView.value = orteView.peek() === id ? null : id))}>
                <span class="hud-badge">
                  <Icon name={icon} size={18} />
                </span>
                <span class="hud-rt">{label}</span>
              </button>
            </li>
          ))}
        </ul>
        {activeLayers.length > 0 && (
          <>
            <ActiveHead />
            <ul class="hud-rows" role="list" aria-label="Aktive Ebenen">
              {activeLayers.map((id) => {
                const def = getLayer(id);
                if (!def) return null;
                return (
                  <li key={id} class="hud-arow">
                    <button type="button" class="hud-row" aria-current={showing && detailPage.value?.layerId === id ? 'true' : undefined} onClick={() => openActiveLayer(id)}>
                      <span class="hud-badge" style={{ color: def.color }}>
                        <Icon name={def.icon} size={18} />
                      </span>
                      <span class="hud-rt">{def.title}</span>
                    </button>
                    <button type="button" class="hud-rowx" aria-label={`${def.title} ausschalten`} onClick={() => setLayerVisible(working.id, id, false)}>
                      <Icon name="close" size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div class="hud-secthead">
          <h2 class="hud-sect">Karten</h2>
          <div class="hud-filter">
            <button type="button" class="hud-filterbtn hud-optbtn" data-on={sorting} aria-pressed={sorting} aria-label={sorting ? 'Anordnung speichern' : 'Karten anordnen'} onClick={() => setSorting(!sorting)}>
              <span class="hud-optico" aria-hidden="true">
                <Icon name="sliders" size={14} class="hud-ico-a" />
                <Icon name="check" size={14} class="hud-ico-b" />
              </span>
              <span class="hud-optlabel" aria-hidden="true">
                <span>Speichern</span>
              </span>
            </button>
          </div>
        </div>
        <ul class="hud-rows" role="list" aria-label="Karten" ref={kList}>
          {(working.id === SCRATCH_ID ? [working, ...list] : list).map((k) => (
            <li key={k.id} data-key={k.id === SCRATCH_ID ? undefined : k.id}>
              <div class={cx('hud-arow', sorting && k.id !== SCRATCH_ID && 'is-sortable')} onPointerDown={sorting && k.id !== SCRATCH_ID ? (e) => startRowDrag(e, k.id, { list: kList, flipPrev, onDrop: moveKarteTo }) : undefined}>
              {k.id !== SCRATCH_ID && (
                <span class="hud-grip-row" data-on={sorting} aria-hidden="true">
                  <Icon name="grip" size={16} />
                </span>
              )}
              <button type="button" class="hud-row" aria-current={showing && k.id === active.id ? 'true' : undefined} onClick={() => (sorting ? undefined : pickKarte(k.id))}>
                <span class="hud-badge">
                  <Icon name={k.icon} size={18} />
                </span>
                <span class="hud-rt">{k.name}</span>
              </button>
              {sorting && !k.builtin && k.id !== SCRATCH_ID && (
                <button type="button" class="hud-rowx hud-rowdel" aria-label={`${k.name} löschen`} onPointerDown={(e) => e.stopPropagation()} onClick={() => removeKarte(k)}>
                  <Icon name="close" size={13} />
                </button>
              )}
              </div>
            </li>
          ))}
          {expanded && (
          <li>
            <button
              type="button"
              class="hud-row"
              onClick={() => {
                clearSelection();
                leftView.value = 'layers';
                openKarte(createKarte());
                detailOpen.value = true;
              }}
            >
              <span class="hud-badge hud-badge-quiet">
                <Icon name="plus" size={18} />
              </span>
              <span class="hud-rt">Neue Karte</span>
            </button>
          </li>
          )}
        </ul>
        <button type="button" class="hud-more" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? 'Weniger anzeigen' : 'Mehr anzeigen'}
        </button>
        <Recents />
      </ScrollArea>
    </Panel>
  );
}

/** Drag handle on the right edge of the main menu. Double click resets the width. */
function Grip() {
  return (
    <div
      class="hud-grip"
      role="separator"
      aria-orientation="vertical"
      aria-label="Breite des Menüs"
      title="Ziehen, um die Breite zu ändern"
      onDblClick={() => setHudMainWidth(HUD_MAIN_DEFAULT)}
      onPointerDown={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.setPointerCapture(e.pointerId);
        const x0 = e.clientX;
        const w0 = hudMainWidth.peek();
        el.dataset.drag = 'true';
        const move = (ev: PointerEvent) => setHudMainWidth(w0 + ev.clientX - x0);
        const up = () => {
          delete el.dataset.drag;
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.removeEventListener('pointercancel', up);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
      }}
    />
  );
}

/** Floating capsule at the bottom of the Karte detail: add a layer, edit layers and order (pencil), actions of an own Karte. */
function BottomBar() {
  const k = browsedKarte.value;
  const own = !k.builtin && k.id !== SCRATCH_ID;
  const editing = editMode.value;
  useEffect(() => () => void (editMode.value = false), []);
  // a press on anything that is not part of editing (the map, the main menu, empty space in the panel, ...) ends the edit mode
  useEffect(() => {
    if (!editing) return;
    const on = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.lrow, .lgrp-head, .ladd, .hudd-fbar, .hudd-fpop, .hudd-head button, .kchange, .popover, .hudc-scrim, .toasts')) editMode.value = false;
    };
    document.addEventListener('pointerdown', on, true);
    return () => document.removeEventListener('pointerdown', on, true);
  }, [editing]);
  return (
    <>
      {/* edit mode of an own Karte: its actions (rename, duplicate, link, delete) stay open above the capsule until the pencil is pressed again */}
      <div class="hudd-fpop">{editing && own && <KartenPopover key={k.id} open onClose={() => {}} anchor={{ current: null }} only={k.id} up align="start" class="hud-fmenu" />}</div>
      <div class="hudd-fbar" role="group" aria-label="Karte">
        <IconButton icon="plus-square" size={21} label="Ebene hinzufügen" onClick={() => (leftView.value = 'catalog')} />
        <IconButton icon="pencil" size={21} label="Bearbeiten" pressed={editing} onClick={() => (editMode.value = !editing)} />
      </div>
    </>
  );
}

/** Detail menu: map selection, or the active Karte (layers, feed), or the catalog / settings view. */
function DetailPanel() {
  if (orteView.value === 'routes') return <RoutePanel />;
  if (orteView.value === 'places') return <SavedPlaces />;
  const sel = inspector.value;
  const p = probe.value;
  const k = browsedKarte.value;

  if (sel || p) {
    return (
      <Panel as="section" class="hudd" aria-label="Auswahl">
        <ScrollArea class="hudd-scroll">
          {sel ? <InspectorCard key={`${sel.layerId}:${sel.card.title}:${sel.card.time ?? ''}`} card={sel.card} layerId={sel.layerId} /> : place.value ? <PlaceCard /> : <ProbeCard />}
        </ScrollArea>
      </Panel>
    );
  }
  const pushed = detailPage.value?.karteId === k.id;
  return (
    <Panel as="section" class={cx('hudd')} aria-label={k.name} data-bar={!pushed}>
      {!pushed && (
        <header class="hudd-head">
          <h2>{k.name}</h2>
          <span class="hudd-btns">
            <IconButton icon="close" label="Schließen" shortcut="Esc" class="hud-rbtn" onClick={closeKarteDetail} />
          </span>
        </header>
      )}
      {!pushed && <KartenChangeRow short />}
      <div class="lcontent">
        <LeftBody view="layers" />
      </div>
      {!pushed && !k.builtin && <BottomBar />}
    </Panel>
  );
}

/** Left HUD of the desktop layout: main menu (hideable, resizable) and, next to it, the detail menu. */
export function LeftHud() {
  const open = leftPanelOpen.value;
  const detail = detailVisible.value;
  return (
    <div class="hudl" data-main={open ? 'open' : 'closed'} style={{ '--hud-main-w': `${hudMainWidth.value}px`, '--hud-detail-w': `${HUD_DETAIL_W}px`, '--hud-gap': `${HUD_GAP}px` }}>
      <div class="hudl-main" {...(open ? {} : ({ inert: '' } as object))}>
        <MainPanel />
        <Grip />
      </div>
      {detail && <DetailPanel />}
      {!open && (
        <Panel as="div" class="hudl-mini">
          <h1>
            <OrbisMark size={28} variant="small" />
            Orbis Karten
          </h1>
          <IconButton icon="panel-left" label="Menü einblenden" shortcut="mod+B" class="hud-rbtn" onClick={() => (leftPanelOpen.value = true)} />
        </Panel>
      )}
    </div>
  );
}

/** "Ebene hinzufügen" as a sheet over the map (desktop), like the add sheet of Apple Maps. */
export function CatalogModal() {
  if (isMobile.value || leftView.value !== 'catalog') return null;
  const close = () => (leftView.value = 'layers');
  return (
    <div class="hudc-scrim" onClick={(e) => e.target === e.currentTarget && close()}>
      <Panel as="div" class="hudc" role="dialog" aria-modal="true" aria-label="Ebene hinzufügen">
        <Catalog modal />
      </Panel>
    </div>
  );
}

/** Settings as a sheet over the map (desktop); Cmd+, and Esc toggle/close it. */
export function SettingsModal() {
  if (isMobile.value || leftView.value !== 'settings') return null;
  const close = () => (leftView.value = 'layers');
  return (
    <div class="hudc-scrim" onClick={(e) => e.target === e.currentTarget && close()}>
      <Panel as="div" class="hudc hudc-set" role="dialog" aria-modal="true" aria-label="Einstellungen">
        <ScrollArea class="hudc-body">
          <SettingsView modal />
        </ScrollArea>
        <footer class="cat-foot">
          <Button variant="primary" onClick={close}>
            Fertig
          </Button>
        </footer>
      </Panel>
    </div>
  );
}
