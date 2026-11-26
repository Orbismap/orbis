import type { Departure } from '../data/types';
import { LineBadge, PlatformSign } from './Badges';
import { clock, delayState, delayText, inMinutes } from './format';

/** Kompakte Zeile (Start-Screen): Badge, Ziel, "in 5 min" mit Verspätung. */
export function DepartureRow({ d, now, onClick }: { d: Departure; now: number; onClick?: () => void }) {
  const state = delayState(d.time);
  return (
    <button type="button" class={`bn-dep ${d.cancelled ? 'bn-cx' : ''}`} onClick={onClick}>
      <LineBadge mode={d.mode} line={d.line} />
      <span class="bn-dep-to">{d.headsign}</span>
      <span class="bn-dep-when">
        <b class={state === 'late' ? 'bn-late' : ''}>{d.cancelled ? 'Ausfall' : inMinutes(d.time.actual, now)}</b>
        {!d.cancelled && delayText(d.time) && <small class={state === 'late' ? 'bn-late' : 'bn-ok'}>{delayText(d.time)}</small>}
      </span>
    </button>
  );
}

/** Zeile der Abfahrtstafel: Zeit (mit Verspätung), Badge und Ziel, Gleisschild. */
export function BoardRow({ d }: { d: Departure }) {
  const state = delayState(d.time);
  const late = state === 'late' && d.time.delayMin != null;
  return (
    <div class={`bn-brow ${d.cancelled ? 'bn-cx' : ''}`}>
      <div class="bn-bt">
        {clock(d.time.planned)}
        {d.cancelled ? <small class="bn-late">Ausfall</small> : late ? <small class="bn-late">{clock(d.time.actual)}</small> : state === 'ok' && <small class="bn-ok">pünktlich</small>}
      </div>
      <div class="bn-bm">
        <LineBadge mode={d.mode} line={d.line} />
        <div class="bn-bto">{d.headsign}</div>
      </div>
      <PlatformSign platform={d.platform} changed={d.platformChanged} mode={d.mode} />
    </div>
  );
}
