import { useRef, useState } from 'preact/hooks';
import { setBasemap, setLabels, setTerminator } from '../../karten/active';
import { BASEMAPS, BASEMAP_GROUPS } from '../../map/basemaps';
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

/** Popover content. Mounted only while open, so the regional data loads on demand. */
function PickerBody() {
  const k = activeKarte.value;
  const globe = projection.value === 'globe';
  const regional = useRegional();
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
      <div class="bm-scroll">
        {BASEMAP_GROUPS.map((g) => (
          <section key={g.title} class="bm-group" aria-label={g.title}>
            <h4 class="bm-gtitle">{g.title}</h4>
            <div class="bm-grid" role="radiogroup" aria-label={g.title}>
              {g.ids.map((id) => (
                <button key={id} type="button" role="radio" aria-checked={k.basemap === id} class="bm-opt" onClick={() => setBasemap(k.id, id)}>
                  <span class="bm-thumb">
                    <img src={`${import.meta.env.BASE_URL}basemaps/${id}${globe ? '-globe' : ''}.webp`} width={72} height={48} alt="" loading="lazy" decoding="async" draggable={false} />
                  </span>
                  <span class="bm-name">{BASEMAPS[id].label}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
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

/** The month's use of the free Cesium plan: a bar, the numbers in the tooltip. */
function Quota({ used, limit }: { used: number; limit: number }) {
  const text = `${used} von ${limit.toLocaleString('de-DE')} Abrufen bei Cesium diesen Monat (kostenloser Plan)`;
  return (
    <div class="bm-quota" role="progressbar" tabIndex={0} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label="Cesium-Abrufe diesen Monat" aria-valuetext={text} {...tipProps(text, undefined, 'top')}>
      <span style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
    </div>
  );
}
