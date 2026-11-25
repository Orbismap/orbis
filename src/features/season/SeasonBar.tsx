import { MONTH_SHORT, seasonLabel, seasonPos, setSeasonPos } from '../../state/season';
import { activeBasemap } from '../../state/view';
import { Panel } from '../../ui/Panel';
import { Slider } from '../../ui/Slider';
import './season.css';

/** Regler der Basiskarte "Jahreszeiten": die Monatsbilder von Blue Marble werden stufenlos ineinander übergeblendet. Nur sichtbar, solange die Karte läuft. */
export function SeasonBar() {
  if (activeBasemap.value !== 'jahreszeiten') return null;
  const pos = seasonPos.value;
  return (
    <Panel class="season" aria-label="Jahreszeit der Karte">
      <div class="season-head">
        <span class="season-title">Jahreszeit</span>
        <span class="season-value num">{seasonLabel(pos)}</span>
      </div>
      <Slider class="season-slider" value={pos} min={0} max={11.99} step={0.05} onChange={setSeasonPos} format={seasonLabel} aria-label="Jahreszeit der Karte" />
      <div class="season-months" aria-hidden="true">
        {MONTH_SHORT.map((m, i) => (
          <span key={i} class={Math.floor(pos) === i ? 'on' : ''}>{m}</span>
        ))}
      </div>
    </Panel>
  );
}
