import { signal } from '@preact/signals';
import { formatClock, formatRelative, formatSelected } from './math';
import { goLive, live, now, pause, play, playing, time } from '../../state/time';
import { Button, IconButton } from '../../ui/Button';
import { tipProps } from '../../ui/tip-state';

const SPEEDS = [1, 2, 4, 8] as const;
export const speed = signal<(typeof SPEEDS)[number]>(1);
const intervalFor = (s: number) => 450 / s;

export function togglePlay(): void {
  if (playing.value) pause();
  else play(intervalFor(speed.value));
}

export function PlayButton() {
  return (
    <IconButton
      icon={playing.value ? 'pause' : 'play'}
      label={playing.value ? 'Pause' : 'Abspielen'}
      shortcut="Space"
      variant="ghost"
      class="tl-play"
      aria-pressed={playing.value}
      onClick={togglePlay}
    />
  );
}

export function SpeedButton() {
  const s = speed.value;
  const next = () => {
    speed.value = SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]!;
    if (playing.peek()) (pause(), play(intervalFor(speed.value)));
  };
  return (
    <button type="button" class="tl-speed num" onClick={next} aria-label={`Geschwindigkeit ${s}-fach, ändern`} {...tipProps('Abspielgeschwindigkeit')}>
      {s}×
    </button>
  );
}

/** "Mi 11. Nov., 14:00 · in 5 h": time in white, relative part in --now. */
export function Readout() {
  const t = time.value;
  const rel = live.value ? 'jetzt' : formatRelative(t, now.value);
  return (
    <div class="tl-readout" aria-live="polite" aria-atomic="true">
      <span class="tl-when num">{formatSelected(t)}</span>
      <span class="tl-rel num">{rel}</span>
    </div>
  );
}

/** "Jetzt" button when scrubbed away, a quiet "Live" marker otherwise. Same slot, no layout shift. */
export function LiveSlot() {
  const isLive = live.value;
  return isLive ? (
    <span class="tl-live num">
      <span class="tl-live-dot" aria-hidden="true" />
      Live
    </span>
  ) : (
    <Button variant="secondary" class="tl-now" onClick={goLive} {...tipProps('Zur aktuellen Zeit', 'J')}>
      Jetzt
    </Button>
  );
}

/** Slim pill used when no visible layer has a time dimension. */
export function LivePill() {
  const n = now.value;
  return (
    <div class="tl-pill" role="status">
      <span class="tl-live-dot" aria-hidden="true" />
      <span class="num">Live</span>
      <span class="tl-pill-time num">{formatClock(n)}</span>
    </div>
  );
}
