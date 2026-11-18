import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { setBasemap, setLabels, setTerminator } from '../../karten/active';
import { keySignal } from '../../keys/store';
import { BASEMAPS, BASEMAP_GROUPS, seriesOf, type BasemapGroup, type BasemapSeries } from '../../map/basemaps';
import { activeKarte } from '../../state/session';
import { Icon } from '../../ui/icons/Icon';
import { Segmented } from '../../ui/Segmented';
import { tipProps } from '../../ui/tip-state';
import { buildings3d, projection, setBuildings3d, setProjection } from '../../state/view';
import { cx } from '../../ui/hooks';
import { Popover } from '../../ui/Popover';
import { Switch } from '../../ui/Switch';
import { openKeySettings } from '../boost/open';
import { KEY_TIP, tilesHint, tilesNeedKey, tilesQuota } from '../buildings3d/tiles-source';
import { createPreviews, previewImages, type Previews } from './preview';
import { RegionalSelect, useRegional } from './RegionalSelect';
import './basemap.css';

/** Top rail button (icon shows the current projection) that opens the basemap and view popover. Applies to the active Karte. */
export function BasemapPicker({ side = 'down' }: { side?: 'down' | 'left' }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const globe = projection.value === 'globe';
  const close = () => {
    // give focus back to the rail button when it was inside the popover (Escape) or nowhere
    const a = document.activeElement;
    if (!a || a === document.body || wrap.current?.contains(a)) btn.current?.focus();
    setOpen(false);
  };
  return (
    <div class="bm" ref={wrap}>
      <div class="cap rail-cap">
        <button
          ref={btn}
          type="button"
          class="railbtn"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-pressed={open}
          aria-label={`Grundkarte und Ansicht, aktuell ${globe ? 'Globus' : 'flache Karte'}`}
          onClick={() => (open ? close() : setOpen(true))}
          {...tipProps('Grundkarte und Ansicht', undefined, 'left')}
        >
          <Icon name={globe ? 'globe' : 'map'} size={20} />
        </button>
      </div>
      <Popover open={open} onClose={close} align="end" class={cx('bm-pop', 'bm-left', side === 'left' && 'bm-up')} label="Grundkarte und Ansicht" anchorRef={wrap}>
        <PickerBody />
      </Popover>
    </div>
  );
}

type Id = BasemapGroup['ids'][number];
/** The tab of the boost section (providers with the user's own key) */
const BOOST = 'boost';

/** Popover content. Mounted only while open, so the regional data and the miniatures load on demand. */
function PickerBody() {
  const k = activeKarte.value;
  const globe = projection.value === 'globe';
  const regional = useRegional();
  const categories = BASEMAP_GROUPS.filter((g) => !g.key);
  const keyed = BASEMAP_GROUPS.filter((g) => g.key);
  /** the tab of the active basemap, marked with a dot */
  const activeTab = categories.find((g) => g.ids.includes(k.basemap as never))?.title ?? (keyed.some((g) => g.ids.includes(k.basemap as never)) ? BOOST : undefined);
  const [tab, setTab] = useState(activeTab ?? categories[0]!.title);
  const pv = useRef<Previews>();
  pv.current ??= createPreviews();
  useEffect(() => () => pv.current?.dispose(), []);
  const pick = (id: Id) => setBasemap(k.id, id);
  const group = categories.find((g) => g.title === tab);
  // the maps of the shown tab are rendered now, in order; the others when their tab opens
  useEffect(() => { if (group) pv.current!.request(tileIds(group.ids), true); }, [group]);
  // the year chosen on a slider: its miniature is the tile's picture
  useEffect(() => { if (seriesOf(k.basemap)) pv.current!.request([k.basemap as Id], true); }, [k.basemap]);
  return (
    <>
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
      <div class="bm-tabs" role="tablist" aria-label="Kartenanbieter">
        {categories.map((g) => (
          <button key={g.title} type="button" role="tab" id={`bm-tab-${g.title}`} aria-selected={tab === g.title} class="bm-tab" data-active={activeTab === g.title || undefined} onClick={() => setTab(g.title)}>
            {g.short ?? g.title}
          </button>
        ))}
        <button type="button" role="tab" id="bm-tab-boost" aria-selected={tab === BOOST} aria-label="Mit eigenem Schlüssel (Boost)" class="bm-tab bm-tab-boost" data-active={activeTab === BOOST || undefined} onClick={() => setTab(BOOST)} {...tipProps('Mit eigenem Schlüssel (Boost)', undefined, 'top')}>
          <Icon name="boost" size={14} />
        </button>
      </div>
      <Fit>
        <div key={tab} class="bm-panel" role="tabpanel" aria-labelledby={`bm-tab-${tab}`}>
          {group ? <Maps g={group} current={k.basemap} onPick={pick} /> : <KeyedList groups={keyed} current={k.basemap} onPick={pick} pv={pv.current!} />}
        </div>
      </Fit>
      <RegionalSelect r={regional} />
      <div class="bm-switches">
        <Switch label="Beschriftung" checked={k.labels} onChange={(v) => setLabels(k.id, v)} />
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
        <Switch label="Tag und Nacht" checked={k.terminator} onChange={(v) => setTerminator(k.id, v)} />
      </div>
    </>
  );
}

/** Scroll area whose height follows its content smoothly (up to a limit), so changing tabs does not make the popover jump. */
function Fit({ children }: { children: ComponentChildren }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number>();
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div class="bm-scroll" style={h === undefined ? undefined : { height: `${h}px` }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}

/** The label without the provider's name in front ("Esri Topografie" under the tab Esri is "Topografie"). */
const shortLabel = (label: string, title: string) => (label.startsWith(`${title} `) ? label.slice(title.length + 1) : label);

/** The miniature of a basemap: its plain colour until the render is there, then the image fades in. */
function Tile({ id, fallback, name, checked, onPick, locked }: { id: Id; /** shown until the miniature of `id` is there */ fallback?: Id; name: string; checked: boolean; onPick: () => void; locked?: boolean }) {
  const img = previewImages.value[id] ?? (fallback ? previewImages.value[fallback] : undefined);
  return (
    <button type="button" role="radio" aria-checked={checked} disabled={locked} class="bm-opt" onClick={onPick}>
      <span class="bm-thumb" style={{ background: BASEMAPS[id].background }}>
        {img && <img src={img} alt="" decoding="async" draggable={false} />}
      </span>
      <span class="bm-name">{name}</span>
    </button>
  );
}

/** The ids that get a tile: a series counts once, with its newest map. */
const tileIds = (ids: readonly Id[]): Id[] => ids.filter((id) => { const s = seriesOf(id); return !s || s.ids[0] === id; });

/** All maps of a category as a grid of miniatures, with subheadings where the category has sections. */
function Maps({ g, current, onPick }: { g: BasemapGroup; current: string; onPick: (id: Id) => void }) {
  const sections = g.sections ?? [{ title: '', ids: g.ids }];
  return (
    <div class="bm-maps" role="radiogroup" aria-label={g.title}>
      {sections.map((x) => {
        const tiles = tileIds(x.ids);
        const series = [...new Set(tiles.map((id) => seriesOf(id)).filter((s): s is BasemapSeries => !!s))];
        return (
          <section key={x.title} aria-label={x.title || g.title}>
            {x.title && <h4 class="bm-gtitle">{x.title}</h4>}
            <div class="bm-grid">
              {tiles.map((id) => {
                const s = seriesOf(id);
                if (!s) return <Tile key={id} id={id} name={shortLabel(BASEMAPS[id].label, g.title)} checked={current === id} onPick={() => onPick(id)} />;
                const on = (s.ids as string[]).includes(current);
                // the tile shows the year in use, else the newest; clicking it opens the series at the newest year
                return <Tile key={id} id={on ? (current as Id) : id} fallback={id} name={`${s.label} ${Math.min(...s.years)}–${Math.max(...s.years)}`} checked={on} onPick={() => !on && onPick(id)} />;
              })}
            </div>
            {series.map((s) => <YearSlider key={s.label} s={s} current={current} onPick={onPick} />)}
          </section>
        );
      })}
    </div>
  );
}

/** The year of a series, from oldest (left) to newest (right); unfolds while one of the series' maps is active. */
function YearSlider({ s, current, onPick }: { s: BasemapSeries; current: string; onPick: (id: Id) => void }) {
  const on = (s.ids as string[]).includes(current);
  const asc = s.ids.map((id, i) => ({ id, year: s.years[i]! })).reverse();
  const at = Math.max(0, asc.findIndex((m) => m.id === current));
  return (
    <div class="bm-fold" data-open={on || undefined} aria-hidden={!on}>
      <div class="bm-fold-in">
        <div class="bm-slider">
          <input
            type="range" min={0} max={asc.length - 1} step={1} value={at} tabIndex={on ? 0 : -1}
            aria-label={`${s.label}: Jahr`} aria-valuetext={String(asc[at]!.year)}
            onInput={(e) => onPick(asc[Number((e.currentTarget as HTMLInputElement).value)]!.id)}
          />
          <div class="bm-slider-years">
            <span>{asc[0]!.year}</span>
            <strong>{asc[at]!.year}</strong>
            <span>{asc[asc.length - 1]!.year}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The Boost tab: providers that need the user's own key. Their maps show as miniatures once the key is in. */
function KeyedList({ groups, current, onPick, pv }: { groups: BasemapGroup[]; current: string; onPick: (id: Id) => void; pv: Previews }) {
  return (
    <div class="bm-keyed">
      <p class="bm-kintro"><span class="bm-pill">Boost</span> Mit deinem eigenen kostenlosen Schlüssel des Anbieters.</p>
      {groups.map((g) => <KeyedGroup key={g.title} g={g} current={current} onPick={onPick} pv={pv} />)}
    </div>
  );
}

function KeyedGroup({ g, current, onPick, pv }: { g: BasemapGroup; current: string; onPick: (id: Id) => void; pv: Previews }) {
  const has = !!keySignal(g.key!).value;
  const [open, setOpen] = useState(() => g.ids.includes(current as never));
  useEffect(() => { if (open && has) pv.request(g.ids, true); }, [open, has]);
  return (
    <div class="bm-kgroup">
      <button type="button" class="bm-fold-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span class="bm-fold-title">{g.title}</span>
        <span class="bm-kstate" data-on={has || undefined}>{has ? 'Schlüssel eingetragen' : 'Schlüssel fehlt'}</span>
        <Icon name="chevron-up" size={14} class="bm-chev" />
      </button>
      <div class="bm-fold" data-open={open || undefined} aria-hidden={!open}>
        <div class="bm-fold-in">
          {!has && (
            <button type="button" class="bm-kadd" tabIndex={open ? 0 : -1} onClick={() => openKeySettings(g.key!)}>
              <Icon name="key" size={14} /> Schlüssel eintragen
            </button>
          )}
          <div class="bm-grid bm-kgrid" role="radiogroup" aria-label={g.title}>
            {g.ids.map((id) => <Tile key={id} id={id} name={shortLabel(BASEMAPS[id].label, g.title)} checked={current === id} locked={!has && current !== id} onPick={() => onPick(id)} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The month's use of the free Cesium plan: a bar, the numbers in the tooltip. */
function Quota({ used, limit }: { used: number; limit: number }) {
  const text = `${used} von ${limit.toLocaleString('de-DE')} Abrufen bei Cesium diesen Monat (kostenloser Plan)`;
  return (
    <div class="bm-quota" role="progressbar" tabIndex={0} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label="Cesium-Abrufe diesen Monat" aria-valuetext={text} {...tipProps(text, undefined, 'top')}>
      <span style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
    </div>
  );
}
