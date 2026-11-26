import { hasTimeLayers } from '../../state/time';
import { Panel } from '../../ui/Panel';
import { TimeBand } from './TimeBand';
import { CollapseButton, LivePill, LiveSlot, PlayButton, Readout, SkipRestButton, SpeedButton } from './Transport';
import { ROW_SCALE_MAX, ROW_SCALE_MIN, rowScale, rows } from './rows';
import './timeline.css';

/** Griff am oberen Rand: nach unten ziehen macht die Spuren kleiner, nach oben größer; Doppelklick stellt die Normalgröße wieder her. */
function ResizeGrip() {
  if (!rows.value.length) return null;
  const down = (e: PointerEvent) => {
    const grip = e.currentTarget as HTMLElement;
    const band = grip.parentElement?.querySelector<HTMLElement>('.tband');
    if (!band) return;
    grip.setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    const s0 = rowScale.peek();
    // Platz der Spuren ohne Achse; so folgt der Rand dem Zeiger ungefähr eins zu eins
    const body = Math.max(40, band.offsetHeight - 24);
    const move = (ev: PointerEvent) => (rowScale.value = Math.min(ROW_SCALE_MAX, Math.max(ROW_SCALE_MIN, s0 * (1 - (ev.clientY - y0) / body))));
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  };
  return <div class="tl-grip" data-nodrag role="separator" aria-orientation="horizontal" aria-label="Größe der Spuren, nach unten ziehen macht sie kleiner" onPointerDown={down} onDblClick={() => (rowScale.value = 1)} />;
}

/** Desktop timeline panel (bottom). Collapses to a slim Live pill without time layers. */
export function Timeline() {
  if (!hasTimeLayers.value)
    return (
      <Panel class="timeline timeline-idle">
        <LivePill />
      </Panel>
    );
  return (
    <Panel class="timeline" aria-label="Zeitleiste">
      <ResizeGrip />
      <div class="tl-row">
        <PlayButton />
        <SpeedButton />
        <Readout />
        <SkipRestButton />
        <CollapseButton />
        <LiveSlot />
      </div>
      <TimeBand />
    </Panel>
  );
}

/** Mobile: the timeline row in the bar of the sheet, shown while layers have a time. */
export function TimelineCompact() {
  return (
    <div class="tl-compact">
      <PlayButton />
      <TimeBand compact />
      <LiveSlot />
    </div>
  );
}

export { Readout };
