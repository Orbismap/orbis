import { range, setTime, time, pause } from '../../state/time';
import { skipRest, timeTracks } from '../../state/time-tracks';
import { cx } from '../../ui/hooks';
import { tipProps } from '../../ui/tip-state';

/** Dünne Streifen unter dem Zeitband: farbig, wo sich etwas tut (z. B. eine Art zieht), leer in der Ruhe. Ein Klick springt dorthin. */
export function TimeTracks() {
  const tracks = timeTracks.value;
  if (!tracks.length) return null;
  const { start, end } = range.value;
  const span = end - start;
  const pct = (t: number) => `${Math.min(100, Math.max(0, ((t - start) / span) * 100))}%`;
  const jump = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pause();
    setTime(start + Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * span);
  };
  return (
    <div class="tl-tracks" data-nodrag onPointerDown={jump} aria-hidden="true">
      {tracks.map((tr) => (
        <div key={tr.id} class="tl-track" title={tr.label}>
          {tr.active.map((s, i) => (
            <span key={i} class="tl-span" style={{ left: pct(s.start), width: `calc(${pct(s.end)} - ${pct(s.start)})`, background: tr.color }} />
          ))}
        </div>
      ))}
      <span class="tl-tracks-head" style={{ left: pct(time.value) }} />
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
