import { formatCompact } from '../../core/format';
import { CADENCE_LABEL } from '../catalog/fuzzy';
import type { KarteLayer } from '../../karten/types';
import type { LayerDef, OptionSpec } from '../../layers/types';
import { layerStatus } from '../../state/session';
import { LayerLegend, LayerNotes, OpacityField, OptionFields, shownOptions } from './LayerDetails';
import { PageFoot, PageFrame, ShowSwitch } from './page-kit';
import { customPage } from './pages/registry';

/** Options grouped by kind; a single group is simply called "Optionen". */
export function optionSections(options: OptionSpec[] | undefined): { title: string; specs: OptionSpec[] }[] {
  const groups = [
    { title: 'Auswahl', specs: (options ?? []).filter((o) => o.type === 'select' || o.type === 'multi') },
    { title: 'Werte', specs: (options ?? []).filter((o) => o.type === 'range') },
    { title: 'Schalter', specs: (options ?? []).filter((o) => o.type === 'toggle') },
  ].filter((g) => g.specs.length);
  return groups.length === 1 ? [{ title: 'Optionen', specs: groups[0]!.specs }] : groups;
}

/** Detail page of one layer, pushed into the panel (iOS style). A layer can bring its own body: pages/<id>.tsx. */
export function LayerPage({ layer, def, karteId, from, removable }: { layer: KarteLayer; def: LayerDef; karteId: string; from: string; removable: boolean }) {
  const Custom = customPage(def.id);
  const st = layerStatus.value[def.id];
  // nur die Optionen, die zur gewählten Ansicht passen (`when`): sonst bleiben leere Abschnitte stehen
  const sections = optionSections(shownOptions(def, layer));
  return (
    <PageFrame def={def} from={from}>
      {Custom ? (
        <Custom layer={layer} def={def} karteId={karteId} removable={removable} />
      ) : (
        <>
          <header class="lpage-head">
            <div class="lpage-title">
              <p>{def.summary}</p>
            </div>
          </header>
          <ShowSwitch layer={layer} def={def} karteId={karteId} />
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
          <PageFoot def={def} karteId={karteId} removable={removable} />
        </>
      )}
    </PageFrame>
  );
}
