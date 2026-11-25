import { hasTimeLayers } from '../../state/time';
import { Panel } from '../../ui/Panel';
import { TimeBand } from './TimeBand';
import { SkipRestButton, TimeTracks } from './TimeTracks';
import { LivePill, LiveSlot, PlayButton, Readout, SpeedButton } from './Transport';
import './timeline.css';

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
      <div class="tl-row">
        <PlayButton />
        <SpeedButton />
        <Readout />
        <SkipRestButton />
        <LiveSlot />
      </div>
      <TimeBand />
      <TimeTracks />
    </Panel>
  );
}

/** Mobile: the two rows that live in the sheet's peek detent. */
export function TimelineCompact() {
  if (!hasTimeLayers.value)
    return (
      <div class="tl-compact tl-compact-idle">
        <LivePill />
      </div>
    );
  return (
    <div class="tl-compact">
      <PlayButton />
      <TimeBand compact />
      <LiveSlot />
    </div>
  );
}

export { Readout };
