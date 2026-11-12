import { useMemo, useState } from 'preact/hooks';
import { formatAge, formatNumber, formatPercent } from '../../core/format';
import { manifestEntrySignal } from '../../data/manifest';
import { removeLayer, setLayerOpacity, setLayerOption, setLayerVisible } from '../../karten/store';
import type { KarteLayer } from '../../karten/types';
import type { LayerDef, OptionSpec, SourceRef } from '../../layers/types';
import { layerStatus, legends } from '../../state/session';
import { Button } from '../../ui/Button';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { Slider } from '../../ui/Slider';
import { Switch } from '../../ui/Switch';
import { openKeySettings } from '../boost/open';
import { LegendBody } from '../legend/LegendBody';
import { topFieldLegend } from '../legend/Legend';

function Source({ s }: { s: SourceRef }) {
  const sig = useMemo(() => (s.manifest ? manifestEntrySignal(s.manifest.bucket, s.manifest.key) : undefined), [s.manifest?.bucket, s.manifest?.key]);
  const entry = sig?.value;
  const t = entry ? Date.parse(entry.updated) : NaN;
  return (
    <li class="ld-source">
      <a href={s.url} target="_blank" rel="noopener noreferrer">
        {s.name}
      </a>
      <span class="ld-license">
        {s.license}
        {Number.isFinite(t) && <> · {formatAge(t)}</>}
      </span>
    </li>
  );
}

function Option({ spec, value, onChange }: { spec: OptionSpec; value: number | string | boolean; onChange(v: number | string | boolean): void }) {
  if (spec.type === 'toggle') return <Switch label={spec.label} checked={value === true} onChange={onChange} />;
  if (spec.type === 'select') {
    const choices = spec.choices;
    return (
      <div class="ld-field">
        <span class="ld-label">{spec.label}</span>
        {choices.length <= 3 ? (
          <Segmented aria-label={spec.label} size="sm" value={String(value)} options={choices} onChange={onChange} />
        ) : (
          <Select aria-label={spec.label} value={String(value)} options={choices} onChange={onChange} />
        )}
      </div>
    );
  }
  const v = Number(value);
  const digits = (String(spec.step).split('.')[1] ?? '').length;
  const fmt = (n: number) => `${formatNumber(n, digits)}${spec.unit ? ` ${spec.unit}` : ''}`;
  return (
    <div class="ld-field">
      <div class="ld-line">
        <span class="ld-label">{spec.label}</span>
        <span class="ld-value num">{fmt(v)}</span>
      </div>
      <Slider aria-label={spec.label} value={v} min={spec.min} max={spec.max} step={spec.step} format={fmt} onChange={onChange} />
    </div>
  );
}

/** Expanded part of a layer row: opacity, options, legend, sources, remove. */
export function LayerDetails({ layer, def, karteId }: { layer: KarteLayer; def: LayerDef; karteId: string }) {
  const legend = legends.value[def.id];
  const top = topFieldLegend.value;
  const st = layerStatus.value[def.id];
  const [confirm, setConfirm] = useState(false);
  const reload = () => {
    setLayerVisible(karteId, def.id, false);
    setTimeout(() => setLayerVisible(karteId, def.id, true), 60);
  };
  return (
    <div class="ld" id={`ld-${def.id}`}>
      {st?.needsKey && (
        <p class="ld-note" role="status">
          Diese Ebene braucht einen kostenlosen Schlüssel.{' '}
          <button type="button" class="linkbtn" onClick={() => openKeySettings(st.needsKey!)}>
            Schlüssel eintragen
          </button>
        </p>
      )}
      {(st?.state === 'error' || st?.state === 'empty') && (
        <p class={st.state === 'error' ? 'ld-note is-error' : 'ld-note'} role="status">
          {st.note ?? (st.state === 'error' ? 'Quelle antwortet nicht.' : 'Keine Daten für diese Auswahl.')}{' '}
          {st.state === 'error' && (
            <button type="button" class="linkbtn" onClick={reload}>
              Erneut laden
            </button>
          )}
        </p>
      )}
      <div class="ld-field">
        <div class="ld-line">
          <span class="ld-label">Deckkraft</span>
          <span class="ld-value num">{formatPercent(layer.opacity)}</span>
        </div>
        <Slider aria-label={`Deckkraft ${def.title}`} value={layer.opacity} min={0} max={1} step={0.05} format={(v) => formatPercent(v)} onChange={(v) => setLayerOpacity(karteId, def.id, v)} />
      </div>
      {def.options?.map((o) => (
        <Option key={o.id} spec={o} value={layer.options?.[o.id] ?? o.default} onChange={(v) => setLayerOption(karteId, def.id, o.id, v)} />
      ))}
      {legend && top?.id !== def.id && (
        <div class="ld-legend">
          <LegendBody spec={legend} />
        </div>
      )}
      <div class="ld-sources">
        <span class="ld-label">{def.sources.length > 1 ? 'Quellen' : 'Quelle'}</span>
        <ul role="list">
          {def.sources.map((s) => (
            <Source key={s.url} s={s} />
          ))}
        </ul>
      </div>
      <div class="ld-actions">
        {confirm ? (
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Abbrechen
            </Button>
            <Button variant="destructive" icon="trash" onClick={() => removeLayer(karteId, def.id)}>
              {def.title} entfernen
            </Button>
          </>
        ) : (
          <Button variant="danger" icon="trash" onClick={() => setConfirm(true)}>
            Entfernen
          </Button>
        )}
      </div>
    </div>
  );
}
