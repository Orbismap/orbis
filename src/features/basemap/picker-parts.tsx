import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { setBasemap, setLabels, setTerminator } from '../../karten/active';
import { keySignal } from '../../keys/store';
import { BASEMAPS, BASEMAP_GROUPS, basemapDef, seriesOf, type BasemapGroup, type BasemapSeries } from '../../map/basemaps';
import { activeKarte } from '../../state/session';
import { buildings3d, projection, setBuildings3d, setProjection } from '../../state/view';
import { Icon } from '../../ui/icons/Icon';
import { Segmented } from '../../ui/Segmented';
import { Switch } from '../../ui/Switch';
import { tipProps } from '../../ui/tip-state';
import { openKeySettings } from '../boost/open';
import { KEY_TIP, tilesHint, tilesNeedKey, tilesQuota } from '../buildings3d/tiles-source';
import { createPreviews, previewImages, type Previews } from './preview';
import { RegionalSelect, useRegional } from './RegionalSelect';
import './basemap.css';

export type Id = BasemapGroup['ids'][number];
/** The tab of the boost section (providers with the user's own key) */
export const BOOST = 'boost';
export const CATEGORIES = BASEMAP_GROUPS.filter((g) => !g.key);
export const KEYED = BASEMAP_GROUPS.filter((g) => g.key);
/** The Boost tab of the compact popover stands for every provider with a key (the large view lists them one by one). */
export const isBoostTab = (tab: string | undefined) => tab === BOOST || KEYED.some((g) => g.title === tab);

/** What the compact popover and the large view share: the tab, the miniatures (one render map for both) and what they need. */
export interface PickerState {
  tab: string;
  setTab(t: string): void;
  /** the tab of the active basemap, marked with a dot */
  activeTab: string | undefined;
  pv: Previews;
}

/**
 * State of the picker while it is shown (compact or large). `active` false drops it all, so the next opening starts at the tab of the
 * active map with fresh miniatures; the hand-over between the popover and the large view keeps `active` true and so keeps both.
 */
export function usePickerState(active: boolean): PickerState | undefined {
  const k = activeKarte.value;
  const [chosen, setChosen] = useState<string>();
  const pv = useRef<Previews>();
  if (active && !pv.current) pv.current = createPreviews();
  useEffect(() => {
    if (active) return;
    pv.current?.dispose();
    pv.current = undefined;
    setChosen(undefined);
  }, [active]);
  useEffect(() => () => pv.current?.dispose(), []);
  if (!active || !pv.current) return undefined;
  // the tab of the active map: its category or, for a provider with a key, that provider
  const activeTab = [...CATEGORIES, ...KEYED].find((g) => g.ids.includes(k.basemap as never))?.title;
  return { tab: chosen ?? activeTab ?? CATEGORIES[0]!.title, setTab: setChosen, activeTab, pv: pv.current };
}

/** Renders what the shown tab and the active map need (the maps of a tab when it opens, the year of a series). */
export function usePickerRequests(s: PickerState): void {
  const k = activeKarte.value;
  const group = CATEGORIES.find((g) => g.title === s.tab);
  const keyed = KEYED.find((g) => g.title === s.tab);
  const has = !!keySignal(keyed?.key ?? '').value;
  useEffect(() => { if (group) s.pv.request(tileIds(group.ids), true); }, [group]);
  useEffect(() => { if (keyed && has) s.pv.request(keyed.ids, true); }, [keyed, has]);
  useEffect(() => { if (seriesOf(k.basemap)) s.pv.request([k.basemap as Id], true); }, [k.basemap]);
}

/** The tab content: the maps of a category or of one provider with a key, or (compact Boost tab) all providers with a key. */
export function TabPanel({ s }: { s: PickerState }) {
  const k = activeKarte.value;
  const group = CATEGORIES.find((g) => g.title === s.tab);
  const keyed = KEYED.find((g) => g.title === s.tab);
  const pick = (id: Id) => setBasemap(k.id, id);
  return (
    <div key={s.tab} class="bm-panel" role="tabpanel" aria-labelledby={`bm-tab-${s.tab}`}>
      {group ? <Maps g={group} current={k.basemap} onPick={pick} /> : keyed ? <KeyedMaps g={keyed} current={k.basemap} onPick={pick} /> : <KeyedList groups={KEYED} current={k.basemap} onPick={pick} pv={s.pv} />}
    </div>
  );
}

/** One provider with its own key as a tab of its own: the key state, then its maps like any other category (off until the key is in). */
export function KeyedMaps({ g, current, onPick }: { g: BasemapGroup; current: string; onPick: (id: Id) => void }) {
  const has = !!keySignal(g.key!).value;
  return (
    <div class="bm-maps">
      <p class="bm-kintro">
        <span class="bm-pill">Boost</span>
        <span>{has ? 'Dein Schlüssel ist eingetragen.' : `Mit deinem eigenen kostenlosen Schlüssel von ${g.title}.`}</span>
      </p>
      {!has && (
        <button type="button" class="bm-kadd" onClick={() => openKeySettings(g.key!)}>
          <Icon name="key" size={14} /> Schlüssel eintragen
        </button>
      )}
      <div class="bm-grid" role="radiogroup" aria-label={g.title}>
        {g.ids.map((id) => <Tile key={id} id={id} name={shortLabel(BASEMAPS[id].label, g.title)} checked={current === id} locked={!has && current !== id} onPick={() => onPick(id)} />)}
      </div>
    </div>
  );
}

/** Labels, 3D buildings and day/night of the active Karte. */
export function ViewSwitches() {
  const k = activeKarte.value;
  const own = !!basemapDef(k.basemap).ownLabels;
  return (
    <div class="bm-switches">
      <Switch label="Beschriftung" checked={k.labels && !own} disabled={own} onChange={(v) => setLabels(k.id, v)} />
      {own && <p class="bm-hint">Diese Karte bringt ihre eigene Beschriftung mit.</p>}
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
  );
}

/** Scroll area whose height follows its content smoothly (up to a limit), so changing tabs does not make the popover jump. */
export function Fit({ children }: { children: ComponentChildren }) {
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
export const shortLabel = (label: string, title: string) => (label.startsWith(`${title} `) ? label.slice(title.length + 1) : label);

/** The miniature of a basemap: its plain colour until the render is there, then the image fades in. */
export function Tile({ id, fallback, name, checked, onPick, locked }: { id: Id; /** shown until the miniature of `id` is there */ fallback?: Id; name: string; checked: boolean; onPick: () => void; locked?: boolean }) {
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
export const tileIds = (ids: readonly Id[]): Id[] => ids.filter((id) => { const s = seriesOf(id); return !s || s.ids[0] === id; });

/** All maps of a category as a grid of miniatures, with subheadings where the category has sections. */
export function Maps({ g, current, onPick }: { g: BasemapGroup; current: string; onPick: (id: Id) => void }) {
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
export function YearSlider({ s, current, onPick }: { s: BasemapSeries; current: string; onPick: (id: Id) => void }) {
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
export function KeyedList({ groups, current, onPick, pv }: { groups: BasemapGroup[]; current: string; onPick: (id: Id) => void; pv: Previews }) {
  return (
    <div class="bm-keyed">
      <p class="bm-kintro"><span class="bm-pill">Boost</span> Mit deinem eigenen kostenlosen Schlüssel des Anbieters.</p>
      {groups.map((g) => <KeyedGroup key={g.title} g={g} current={current} onPick={onPick} pv={pv} />)}
    </div>
  );
}

export function KeyedGroup({ g, current, onPick, pv }: { g: BasemapGroup; current: string; onPick: (id: Id) => void; pv: Previews }) {
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
export function Quota({ used, limit }: { used: number; limit: number }) {
  const text = `${used} von ${limit.toLocaleString('de-DE')} Abrufen bei Cesium diesen Monat (kostenloser Plan)`;
  return (
    <div class="bm-quota" role="progressbar" tabIndex={0} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label="Cesium-Abrufe diesen Monat" aria-valuetext={text} {...tipProps(text, undefined, 'top')}>
      <span style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
    </div>
  );
}

/** Popover content (also the first picture of the large view while it grows). Mounted only while shown, so the regional data loads on demand. */
export function PickerBody({ s, onExpand }: { s: PickerState; onExpand(): void }) {
  const globe = projection.value === 'globe';
  const regional = useRegional();
  usePickerRequests(s);
  return (
    <>
      <div class="bm-top">
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
        <button type="button" class="bm-expand" aria-label="Große Ansicht" onClick={onExpand} {...tipProps('Große Ansicht', undefined, 'top')}>
          <Icon name="expand" size={16} />
        </button>
      </div>
      <div class="bm-tabs" role="tablist" aria-label="Kartenanbieter">
        {CATEGORIES.map((g) => (
          <button key={g.title} type="button" role="tab" id={`bm-tab-${g.title}`} aria-selected={s.tab === g.title} class="bm-tab" data-active={s.activeTab === g.title || undefined} onClick={() => s.setTab(g.title)}>
            {g.short ?? g.title}
          </button>
        ))}
        <button type="button" role="tab" id="bm-tab-boost" aria-selected={isBoostTab(s.tab)} aria-label="Mit eigenem Schlüssel (Boost)" class="bm-tab bm-tab-boost" data-active={isBoostTab(s.activeTab) || undefined} onClick={() => s.setTab(BOOST)} {...tipProps('Mit eigenem Schlüssel (Boost)', undefined, 'top')}>
          <Icon name="boost" size={14} />
        </button>
      </div>
      <Fit>
        <TabPanel s={s} />
      </Fit>
      <RegionalSelect r={regional} />
      <ViewSwitches />
    </>
  );
}
