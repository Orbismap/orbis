import { Fragment, type ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { setBasemap, setLabels, setTerminator } from '../../karten/active';
import { keySignal } from '../../keys/store';
import { AERIAL_GROUPS, BASEMAPS, KARTE_GROUPS, MAP_MODES, basemapDef, isAerial, keyOfBasemap, showsRelief, type MapMode } from '../../map/basemaps';
import { isWorldwide } from '../../map/basemaps/regional';
import type { BasemapId } from '../../map/types';
import { activeKarte } from '../../state/session';
import { buildings3d, karteMode, projection, setBuildings3d, setProjection } from '../../state/view';
import { cx } from '../../ui/hooks';
import { Icon } from '../../ui/icons/Icon';
import { Segmented } from '../../ui/Segmented';
import { Switch } from '../../ui/Switch';
import { tipProps } from '../../ui/tip-state';
import { openKeySettings } from '../boost/open';
import { KEY_TIP, tilesHint, tilesNeedKey, tilesQuota } from '../buildings3d/tiles-source';
import { createPreviews, previewImages, type Previews } from './preview';
import { useRegional, type RegionalState } from './use-regional';
import { aerialList } from './regional-list';
import './basemap.css';

/** The map a mode card shows: the Orbis colours the plain maps have (the light ones while a light map is on), a satellite image for Satellit. */
const modeThumb = (mode: MapMode, current: string): BasemapId => (mode === 'luftbild' ? 'satellite' : current === 'orbis-light' ? 'orbis-light' : 'orbis-dark');

/** The maps last used in each kind, so a mode switch returns to them (module state: it lives as long as the page). */
const lastUsed = { karte: 'orbis-dark' as BasemapId, aerial: 'satellite' as BasemapId };

/** Miniatures of the picker: one render map for everything shown; it is freed when the picker closes, so the next opening renders fresh ones. */
export function usePickerState(active: boolean): Previews | undefined {
  const pv = useRef<Previews>();
  if (active && !pv.current) pv.current = createPreviews();
  useEffect(() => {
    if (!active) {
      pv.current?.dispose();
      pv.current = undefined;
    }
  }, [active]);
  useEffect(() => () => pv.current?.dispose(), []);
  return active ? pv.current : undefined;
}

/** Mode shown: Satellit while an aerial image is on, else the mode picked for the plain maps. */
const modeOf = (basemap: string): MapMode => (isAerial(basemap) ? 'luftbild' : karteMode.value);

/** Switches the mode: the plain modes keep the map when it is a plain one, Satellit opens the last aerial image (and back again). */
function pickMode(mode: MapMode): void {
  const k = activeKarte.peek();
  if (isAerial(k.basemap)) lastUsed.aerial = k.basemap;
  else lastUsed.karte = k.basemap;
  if (mode === 'luftbild') {
    if (!isAerial(k.basemap)) setBasemap(k.id, lastUsed.aerial);
    return;
  }
  karteMode.value = mode;
  if (isAerial(k.basemap)) setBasemap(k.id, lastUsed.karte);
}

/** Calls `seen` once, when the element first becomes visible (not while it is cut off by a folded grid or scrolled out). */
function useSeen<T extends Element>(seen: (() => void) | undefined) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !seen) return;
    if (typeof IntersectionObserver === 'undefined') return seen();
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) (seen(), io.disconnect()); });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

/** The miniature of a basemap: its plain colour until the render is there, then the image fades in. */
export function Tile({ id, fallback, name, title, checked, onPick, locked, seen, col }: {
  id: BasemapId;
  /** shown until the miniature of `id` is there */
  fallback?: BasemapId;
  name: string;
  title?: string;
  checked: boolean;
  onPick: () => void;
  /** needs a key that is not in yet: the tile is dimmed and opens the key settings instead */
  locked?: boolean;
  /** called once when the tile is first visible: renders its miniature */
  seen?: () => void;
  /** grid column the tile starts in (the first tile of a group that does not start at the left) */
  col?: number;
}) {
  const ref = useSeen<HTMLButtonElement>(seen);
  const img = previewImages.value[id] ?? (fallback ? previewImages.value[fallback] : undefined);
  return (
    <button ref={ref} type="button" role="radio" aria-checked={checked} class={cx('bm-opt', locked && 'is-locked')} style={col ? { gridColumnStart: col } : undefined} title={title} onClick={onPick}>
      <span class="bm-thumb" style={{ background: basemapDef(id).background }}>
        {img && <img src={img} alt="" decoding="async" draggable={false} />}
        {locked && <span class="bm-lock" aria-hidden="true"><Icon name="key" size={12} /></span>}
      </span>
      <span class="bm-name">{name}</span>
    </button>
  );
}

/** The label without the provider's name in front ("Esri Topografie" under the heading Esri is "Topografie"). */
const shortLabel = (label: string, title: string) => {
  const name = title.replace(/ \(.*\)$/, ''); // "Sentinel-2 (EOX)" -> "Sentinel-2"
  return label.startsWith(`${name} `) ? label.slice(name.length + 1) : label;
};

/**
 * A titled list of tiles in a box of fixed height that always scrolls. "Mehr anzeigen" only makes the box taller (and "Weniger anzeigen" shorter again).
 * Folded it ends in the middle of a row, with a fade. Tiles render their miniature once they are scrolled into view.
 */
function Shelf({ id, title, children, rows, openRows }: {
  id: string;
  title: string;
  children: ComponentChildren;
  /** rows in view while folded / unfolded (a fraction ends in the middle of a row) */
  rows: number;
  openRows: number;
}) {
  const inner = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [m, setM] = useState<{ row: number; gap: number; full: number }>();
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => {
      const grid = el.firstElementChild as HTMLElement | null;
      const row = (grid?.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
      setM({ row, gap: parseFloat(getComputedStyle(grid ?? el).rowGap) || 0, full: el.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const height = (n: number) => (m ? Math.round(m.row * n + m.gap * Math.floor(n)) : undefined);
  const folded = height(rows);
  const unfolded = height(openRows);
  const folds = !!m && !!folded && m.full > folded + 6;
  const h = m && folded && unfolded ? Math.min(m.full, open ? unfolded : folded) : undefined;
  return (
    <section class="bm-sec" aria-labelledby={`${id}-title`}>
      <h4 class="bm-gtitle" id={`${id}-title`}>{title}</h4>
      <div class="bm-list" data-fade={folds || undefined} style={h === undefined ? undefined : { height: `${h}px` }}>
        <div ref={inner}>
          <div class="bm-grid" role="radiogroup" aria-labelledby={`${id}-title`}>{children}</div>
        </div>
      </div>
      {folds && (
        <button type="button" class="bm-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Weniger anzeigen' : 'Mehr anzeigen'}
        </button>
      )}
    </section>
  );
}

/** Tiles per row of the list */
const COLS = 4;
/** Groups that follow each other share a row while their tiles together fit in it (1+1, 1+3, 2+2 ...); a bigger group takes rows of its own. */
function packGroups<T extends { ids: readonly unknown[] }>(groups: readonly T[]): T[][] {
  const rows: T[][] = [];
  let n = 0;
  for (const g of groups) {
    const last = rows[rows.length - 1];
    if (last && n + g.ids.length <= COLS && g.ids.length < COLS) {
      last.push(g);
      n += g.ids.length;
    } else {
      rows.push([g]);
      n = g.ids.length < COLS ? g.ids.length : COLS; // a group of four or more fills its rows, nothing joins it
    }
  }
  return rows;
}

/** The list of the modes: the four modes first, then the maps of the shown mode (the plain maps for Daten, Erkunden and Fahren, the aerial images for Satellit). */
function ModeShelf({ pv, mode }: { pv: Previews; mode: MapMode }) {
  const k = activeKarte.value;
  const groups = mode === 'luftbild' ? AERIAL_GROUPS : KARTE_GROUPS;
  const pick = (id: BasemapId) => {
    lastUsed[isAerial(id) ? 'aerial' : 'karte'] = id;
    setBasemap(k.id, id);
  };
  return (
    // a new mode starts folded again
    <Shelf key={mode} id="bm-modes" title="Kartenmodi" rows={1.75} openRows={3.5}>
      {MAP_MODES.map((m) => {
        const id = modeThumb(m.id, k.basemap);
        return <Tile key={m.id} id={id} name={m.label} checked={mode === m.id} onPick={() => pickMode(m.id)} seen={() => pv.request([id], true)} />;
      })}
      {packGroups(groups).map((row) => {
        // groups that share a row: the first ones follow each other from the left, the last one stands at the right edge (free columns between them)
        const start = row.map((g, i) => (row.length === 1 ? 1 : i === row.length - 1 ? COLS - g.ids.length + 1 : 1 + row.slice(0, i).reduce((n, x) => n + x.ids.length, 0)));
        return (
          // all headings of a row first, then all its tiles; the first heading starts in column 1, so a row begins on a new line
          // (not in the free cells after the last tile of the group before)
          <Fragment key={row[0]!.title}>
            {row.map((g, i) => <h5 key={g.title} class="bm-sub" style={{ gridColumn: row.length === 1 ? '1 / -1' : `${start[i]} / ${i === row.length - 1 ? COLS + 1 : start[i + 1]!}` }}>{g.title}</h5>)}
            {row.flatMap((g, i) => g.ids.map((id, n) => {
              const key = keyOfBasemap(id);
              const locked = !!key && !keySignal(key).value && k.basemap !== id;
              const seen = locked ? undefined : () => pv.request([id], true);
              return <Tile key={id} id={id} col={n === 0 && row.length > 1 ? start[i] : undefined} name={shortLabel(BASEMAPS[id as keyof typeof BASEMAPS].label, g.title)} checked={k.basemap === id} locked={locked} title={locked ? 'Eigenen Schlüssel eintragen' : undefined} onPick={() => (locked ? openKeySettings(key!) : pick(id))} seen={seen} />;
            }))}
          </Fragment>
        );
      })}
    </Shelf>
  );
}

/** Regional maps touching the view, nearest first, as miniatures like the global ones. */
function Regional({ pv, r, aerial }: { pv: Previews; r: RegionalState; aerial: boolean }) {
  const k = activeKarte.value;
  // Satellit: only aerial photos, the best one for the map centre first and marked as recommended (never switched to by itself)
  const shown = aerial ? aerialList(r.list, k.basemap) : { best: undefined, list: r.list };
  const title = aerial ? 'Regionale Luftbilder' : 'Regionale Karten';
  const hint = r.failed ? 'Regionale Karten konnten nicht geladen werden.' : !r.ready ? 'Lade regionale Karten …' : r.wide ? 'Näher heranzoomen, um regionale Karten zu sehen.' : shown.list.length === 0 ? (aerial ? 'Für diesen Ausschnitt gibt es keine regionalen Luftbilder.' : 'Für diesen Ausschnitt gibt es keine regionalen Karten.') : '';
  if (shown.list.length === 0) {
    return (
      <section class="bm-sec" aria-labelledby="bm-regional-title">
        <h4 class="bm-gtitle" id="bm-regional-title">{title}</h4>
        {hint && <p class="bm-hint">{hint}</p>}
      </section>
    );
  }
  return (
    <div onPointerEnter={r.hold} onPointerLeave={r.release} onFocusIn={r.hold} onFocusOut={r.release}>
      <Shelf id="bm-regional" title={title} rows={1.5} openRows={3.5}>
        {shown.list.map(({ item }) => (
          <Tile
            key={item.id} id={item.id} name={item.label} title={`${item.country && !isWorldwide(item.bounds) ? `${item.label} · ${item.country}` : item.label}${shown.best?.item.id === item.id ? ' (empfohlen: deckt die Kartenmitte ab, hochauflösend)' : ''}`}
            checked={k.basemap === item.id} onPick={() => setBasemap(k.id, item.id)} seen={() => pv.request([item.id], true)}
          />
        ))}
      </Shelf>
    </div>
  );
}

/** Globe or flat map, labels, 3D buildings and day/night of the active Karte. */
export function ViewSwitches() {
  const k = activeKarte.value;
  const own = !!basemapDef(k.basemap).ownLabels;
  const globe = projection.value === 'globe';
  return (
    <div class="bm-switches">
      <Segmented
        block
        aria-label="Ansicht"
        value={globe ? 'globe' : 'mercator'}
        options={[
          { value: 'globe', label: 'Globus' },
          { value: 'mercator', label: 'Karte' },
        ]}
        onChange={(v) => setProjection(v)}
      />
      <Switch label="Beschriftung" checked={k.labels && !own} disabled={own} onChange={(v) => setLabels(k.id, v)} />
      {own && <p class="bm-hint">Diese Karte bringt ihre eigene Beschriftung mit.</p>}
      {showsRelief(karteMode.value, k.basemap) && (
        <>
          <div class="bm-switch-wrap">
            <Switch label="3D-Gebäude" checked={buildings3d.value} onChange={setBuildings3d} />
            {tilesNeedKey.value && (
              <button type="button" class="bm-key" aria-label="Cesium-Token eintragen" {...tipProps(KEY_TIP, undefined, 'top')} onClick={() => openKeySettings('cesiumion')}>
                <Icon name="key" size={14} />
              </button>
            )}
          </div>
          {tilesHint.value && <p class="bm-hint">{tilesHint.value}</p>}
          {tilesQuota.value && <Quota used={tilesQuota.value.used} limit={tilesQuota.value.limit} />}
        </>
      )}
      <Switch label="Tag und Nacht" checked={k.terminator} onChange={(v) => setTerminator(k.id, v)} />
    </div>
  );
}

/** The month's use of the free Cesium plan: a bar, the numbers in the tooltip. */
export function Quota({ used, limit }: { used: number; limit: number }) {
  const text = `${used} von ${limit.toLocaleString('de-DE')} Abrufen bei Cesium diesen Monat (kostenloser Plan)`;
  return (
    <div class="bm-quota" role="progressbar" tabIndex={0} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label="Cesium-Abrufe diesen Monat" aria-valuetext={text} {...tipProps(text, undefined, 'top')}>
      <span style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
    </div>
  );
}

/** Popover content; mounted only while shown, so the regional data loads on demand. */
export function PickerBody({ pv }: { pv: Previews }) {
  const regional = useRegional();
  const mode = modeOf(activeKarte.value.basemap);
  return (
    <>
      <ModeShelf pv={pv} mode={mode} />
      <div class="bm-div" role="separator" />
      <Regional pv={pv} r={regional} aerial={mode === 'luftbild'} />
      <ViewSwitches />
    </>
  );
}
