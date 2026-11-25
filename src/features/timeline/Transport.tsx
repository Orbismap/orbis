import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatClock, formatRelative, formatSelected, selectedParts, type SelectedParts } from './math';
import { goLive, live, now, pause, play, playing, range, time } from '../../state/time';
import { skipRest, timeTracks } from '../../state/time-tracks';
import { Button, IconButton } from '../../ui/Button';
import { cx } from '../../ui/hooks';
import { collapsed, rows } from './rows';
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

function applySpeed(v: (typeof SPEEDS)[number]) {
  speed.value = v;
  if (playing.peek()) (pause(), play(intervalFor(v)));
}

/**
 * Ein Klick schaltet die Geschwindigkeit weiter. Bleibt der Zeiger danach noch ~0,5 s darauf, klappen alle Stufen
 * als Reihe daneben auf und lassen sich direkt wählen; sie schließt, wenn der Zeiger weggeht.
 */
export function SpeedButton() {
  const s = speed.value;
  const [open, setOpen] = useState(false);
  const hovering = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const next = () => {
    applySpeed(SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]!);
    clearTimeout(timer.current);
    if (!open) timer.current = setTimeout(() => hovering.current && setOpen(true), 500);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div
      class="tl-speedwrap"
      onPointerEnter={() => (hovering.current = true)}
      onPointerLeave={() => {
        hovering.current = false;
        clearTimeout(timer.current);
        setOpen(false);
      }}
    >
      <button type="button" class="tl-speed num" onClick={next} aria-label={`Geschwindigkeit ${s}-fach, ändern`} {...tipProps('Abspielgeschwindigkeit')}>
        {s}×
      </button>
      {open && (
        <div class="tl-speeds" role="group" aria-label="Geschwindigkeit wählen">
          {SPEEDS.map((v) => (
            <button key={v} type="button" class={cx('tl-speed num', v === s && 'is-on')} aria-pressed={v === s} onClick={() => applySpeed(v)}>
              {v}×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ein Teil der Anzeige: ändert er sich, blendet der alte aus und der neue ein. Der neue beginnt nicht bei 0, damit schnelles Durchfahren lesbar bleibt. */
function Swap({ text, cls }: { text: string; cls: string }) {
  const last = useRef({ cur: text, prev: '', n: 0 });
  if (last.current.cur !== text) last.current = { cur: text, prev: last.current.cur, n: last.current.n + 1 };
  const { prev, n } = last.current;
  return (
    <span class={cx('tl-part', cls)}>
      {prev && <span key={`p${n}`} class="tl-part-prev" aria-hidden="true">{prev}</span>}
      <span key={`c${n}`} class="tl-part-cur">{text}</span>
    </span>
  );
}

const WIDEST: SelectedParts = { time: '00:00', weekday: 'Mi', day: '00.', rest: 'September' };

function Parts({ p, fade }: { p: SelectedParts; fade: boolean }) {
  const part = (key: keyof SelectedParts, cls: string) => {
    const text = p[key];
    if (text === undefined) return null;
    return fade ? <Swap text={text} cls={cls} /> : <span class={cx('tl-part', cls)}><span class="tl-part-cur">{text}</span></span>;
  };
  return (
    <>
      {part('time', 'tl-time')}
      {part('weekday', 'tl-wd')}
      {part('day', 'tl-day')}
      {part('rest', 'tl-rest')}
    </>
  );
}

/** "14:00 Do 12. November · vor 5 h": jedes Teil hat feste Breite, nichts wackelt. */
export function Readout() {
  const t = time.value;
  const step = range.value.step;
  const parts = selectedParts(t, step);
  const rel = live.value ? 'jetzt' : formatRelative(t, now.value);
  return (
    <div class="tl-readout">
      <span class="sr-only" aria-live="polite" aria-atomic="true">{formatSelected(t, step)}</span>
      <span class="tl-when num" aria-hidden="true">
        {/* Unsichtbarer Längster: reserviert die Breite, damit "vor 4 h" nicht mit dem Datum hin- und herspringt */}
        <span class="tl-when-size">
          <Parts p={{ ...WIDEST, time: parts.time && WIDEST.time, weekday: parts.weekday && WIDEST.weekday, day: parts.day && WIDEST.day }} fade={false} />
        </span>
        <span class="tl-when-live">
          <Parts p={parts} fade />
        </span>
      </span>
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

/** Schalter "Ruhe überspringen", solange Spuren da sind. */
export function SkipRestButton() {
  if (!timeTracks.value.length) return null;
  const on = skipRest.value;
  return (
    <button type="button" class={cx('tl-skip', on && 'is-on')} aria-pressed={on} onClick={() => (skipRest.value = !on)} {...tipProps('Beim Abspielen Phasen überspringen, in denen nichts zieht')}>
      Ruhe überspringen
    </button>
  );
}

/** Spuren ein- und ausklappen: eingeklappt sind die Ebenen noch weiter zusammengefasst. Nur da, wo es Datenspuren gibt. */
export function CollapseButton() {
  if (!rows.value.length) return null;
  const on = collapsed.value;
  return (
    <IconButton
      icon={on ? 'expand' : 'collapse'}
      label={on ? 'Spuren ausklappen' : 'Spuren einklappen'}
      variant="ghost"
      class="tl-collapse"
      aria-pressed={on}
      onClick={() => (collapsed.value = !on)}
    />
  );
}
