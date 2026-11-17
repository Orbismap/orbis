import { useEffect, useRef } from 'preact/hooks';
import { formatCompact } from '../../core/format';
import { CADENCE_LABEL } from '../catalog/fuzzy';
import { setLayerVisible } from '../../karten/active';
import type { KarteLayer } from '../../karten/types';
import type { LayerDef, OptionSpec } from '../../layers/types';
import { layerStatus } from '../../state/session';
import { Icon } from '../../ui/icons/Icon';
import { Switch } from '../../ui/Switch';
import { LayerLegend, LayerNotes, OpacityField, OptionFields, RemoveAction, SourceList } from './LayerDetails';
import { closeDetail } from './themes-state';

/** Options grouped by kind; a single group is simply called "Optionen". */
export function optionSections(options: OptionSpec[] | undefined): { title: string; specs: OptionSpec[] }[] {
  const groups = [
    { title: 'Auswahl', specs: (options ?? []).filter((o) => o.type === 'select') },
    { title: 'Werte', specs: (options ?? []).filter((o) => o.type === 'range') },
    { title: 'Schalter', specs: (options ?? []).filter((o) => o.type === 'toggle') },
  ].filter((g) => g.specs.length);
  return groups.length === 1 ? [{ title: 'Optionen', specs: groups[0]!.specs }] : groups;
}

/** Detail page of one layer, pushed into the panel (iOS style). */
export function LayerPage({ layer, def, karteId, from, removable }: { layer: KarteLayer; def: LayerDef; karteId: string; from: string; removable: boolean }) {
  const back = useRef<HTMLButtonElement>(null);
  const st = layerStatus.value[def.id];
  useEffect(() => {
    back.current?.focus({ preventScroll: true });
    for (let el = back.current?.parentElement; el; el = el.parentElement) if (el.scrollTop > 0) el.scrollTop = 0;
  }, [def.id]);
  const sections = optionSections(def.options);
  return (
    <section class="lpage" aria-label={def.title} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), closeDetail())}>
      <button ref={back} type="button" class="lpage-back" aria-label={`Zurück zu ${from}`} onClick={closeDetail}>
        <Icon name="chevron-left" size={18} />
        <span>{from}</span>
      </button>
      <header class="lpage-head">
        <span class="lrow-badge" style={{ ['--c' as string]: def.color }} aria-hidden="true">
          <Icon name={def.icon} size={18} />
        </span>
        <div class="lpage-title">
          <h3>{def.title}</h3>
          <p>{def.summary}</p>
        </div>
      </header>
      <div class="lpage-group">
        <Switch class="lpage-switch" label="Auf der Karte zeigen" checked={layer.visible} onChange={(v) => setLayerVisible(karteId, def.id, v)} />
      </div>
      <LayerNotes def={def} karteId={karteId} />
      {sections.map((sec) => (
        <div key={sec.title} class="lpage-sec">
          <h4 class="lpage-h">{sec.title}</h4>
          <div class="lpage-group lpage-opts">
            <OptionFields layer={layer} def={def} karteId={karteId} specs={sec.specs} />
          </div>
        </div>
      ))}
      <h4 class="lpage-h">Darstellung</h4>
      <div class="lpage-group">
        <OpacityField layer={layer} def={def} karteId={karteId} />
      </div>
      <LayerLegend def={def} />
      <h4 class="lpage-h">Daten</h4>
      <dl class="lpage-group lpage-facts">
        <div><dt>Abdeckung</dt><dd>{def.coverage ?? 'Welt'}</dd></div>
        <div><dt>Aktualisierung</dt><dd>{CADENCE_LABEL[def.cadence]}</dd></div>
        {st?.count !== undefined && <div><dt>Einträge</dt><dd class="num">{formatCompact(st.count)}</dd></div>}
      </dl>
      <SourceList def={def} />
      {removable && <RemoveAction def={def} karteId={karteId} />}
    </section>
  );
}
