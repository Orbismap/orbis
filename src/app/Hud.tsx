import { createPortal } from 'preact/compat';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { localResults, placeResult } from '../features/search/results';
import { ORDER, usePlaces } from '../features/search/Search';
import type { Result } from '../features/search/sources';
import { clearHistory, history, type HistoryEntry, type HistoryKind } from '../state/history';
import { flyToPoint } from '../features/shared/map';
import { openDetail } from '../features/layers-panel/themes-state';
import { selectCard, setProbe } from '../state/selection';
import { InspectorCard } from '../features/inspector/Inspector';
import { KartenChangeRow, KartenPopover } from '../features/karten-bar/actions';
import { detailPage } from '../features/layers-panel/themes-state';
import { PlaceCard } from '../features/place/PlaceCard';
import { ProbeCard } from '../features/probe/ProbeCard';
import '../features/karten-bar/karten-bar.css';
import { createKarte, isDirty, karten } from '../karten/store';
import { clearSelection, inspector, place, probe, selectPlace } from '../state/selection';
import { activeKarte, setActiveKarte } from '../state/session';
import { closeKarteDetail, detailOpen, detailVisible, hudSearchFocus, HUD_DETAIL_W, HUD_GAP, HUD_MAIN_DEFAULT, hudMainWidth, setHudMainWidth } from '../state/hud';
import { leftPanelOpen, leftView } from '../state/ui';
import { Button, IconButton } from '../ui/Button';
import { SettingsView } from '../features/settings/Settings';
import { cx } from '../ui/hooks';
import { Kbd } from '../ui/Chip';
import { Icon } from '../ui/icons/Icon';
import { Panel } from '../ui/Panel';
import { ScrollArea } from '../ui/ScrollArea';
import { flyToPlace } from '../features/search/results';
import { Popover } from '../ui/Popover';
import { OrbisMark } from '../ui/brand/OrbisMark';
import { Catalog } from '../features/catalog/Catalog';
import { LeftBody } from './LeftBody';
import { isMobile } from '../state/ui';
import './hud.css';

function pickKarte(id: string) {
  clearSelection();
  leftView.value = 'layers';
  setActiveKarte(id);
  detailOpen.value = true;
}

const FILTERS: { id: HistoryKind; label: string }[] = [
  { id: 'layer', label: 'Ebenen' },
  { id: 'object', label: 'Objekte' },
  { id: 'place', label: 'Orte' },
  { id: 'search', label: 'Suchen' },
];

function openEntry(e: HistoryEntry) {
  if (e.kind === 'layer' && e.layerId) {
    pickKarte(e.karteId && karten.peek().some((k) => k.id === e.karteId) ? e.karteId : activeKarte.peek().id);
    openDetail(activeKarte.peek().id, e.layerId, 'Karte');
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

const KARTEN_SHOWN = 5;

/** Main menu: search and the list of Karten. */
function MainPanel() {
  const all = karten.value;
  const active = activeKarte.value;
  const [more, setMore] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setActive] = useState(0);
  const [popOpen, setPopOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLLabelElement>(null);
  const places = usePlaces(q);
  const searching = q.trim().length > 0;
  const results = useMemo<Result[]>(() => {
    if (!q.trim()) return [];
    const all = [...localResults(q).filter((r) => r.group === 'Koordinate'), ...(q.trim().length >= 2 ? places.places.map(placeResult) : [])];
    return ORDER.flatMap((g) => all.filter((r) => r.group === g));
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
  const expanded = more;
  const list = expanded ? all : all.slice(0, KARTEN_SHOWN);
  const showing = detailVisible.value && leftView.value !== 'settings' && !inspector.value && !probe.value;
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
        <h2 class="hud-sect hud-sect-first">Karten</h2>
        <ul class="hud-rows" role="list" aria-label="Karten">
          {list.map((k) => (
            <li key={k.id}>
              <button type="button" class="hud-row" aria-current={showing && k.id === active.id ? 'true' : undefined} onClick={() => pickKarte(k.id)}>
                <span class="hud-badge">
                  <Icon name={k.icon} size={18} />
                </span>
                <span class="hud-rt">{k.name}</span>
                {isDirty(k.id) && <span class="kbar-dirty" role="img" aria-label="geändert" />}
              </button>
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
                setActiveKarte(createKarte());
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

/** Floating capsule at the bottom of the Karte detail: add a layer, edit the Karte. */
function BottomBar() {
  const k = activeKarte.value;
  const [menu, setMenu] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  return (
    <>
      <div class="hudd-fpop">
        {menu && <KartenPopover key={k.id} open onClose={() => setMenu(false)} anchor={bar} only={k.id} up align="start" class="hud-fmenu" />}
      </div>
      <div class="hudd-fbar" ref={bar} role="group" aria-label="Karte">
        <IconButton icon="plus-square" size={21} label="Ebene hinzufügen" onClick={() => ((setMenu(false)), (leftView.value = 'catalog'))} />
        <IconButton icon="pencil" size={21} label="Karte bearbeiten" pressed={menu} onClick={() => setMenu(!menu)} />
      </div>
    </>
  );
}

/** Detail menu: map selection, or the active Karte (layers, feed), or the catalog / settings view. */
function DetailPanel() {
  const sel = inspector.value;
  const p = probe.value;
  const k = activeKarte.value;

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
          <IconButton icon="close" label="Schließen" shortcut="Esc" class="hud-rbtn" onClick={closeKarteDetail} />
        </header>
      )}
      {!pushed && <KartenChangeRow short />}
      <div class="lcontent">
        <LeftBody view="layers" />
      </div>
      {!pushed && <BottomBar />}
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
