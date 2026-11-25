import { useMemo } from 'preact/hooks';
import { proAvailable } from '../../ext/loader';
import { proEnabled } from '../../ext/licence';
import { phaseAt, scrubPos, scrubTime, tLabel } from '../../replay/director';
import { tipProps } from '../../ui/tip-state';
import { closeReplay, REPLAY_SPEEDS, replayFocus, setReplayFocus, replayAuto, replayEffectiveSpeed, replayError, replayEvent, replayLoading, replayPlaying, replaySpeed, replayT, seekReplay, setReplaySpeed, toggleReplay } from '../../state/replay';
import { IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons/Icon';
import { EngineStatus } from './EngineStatus';
import './replay.css';

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

function speedLabel(s: number): string {
  return s >= 1000 ? `${nf.format(s / 1000)}k×` : `${nf.format(s)}×`;
}

/** Height and speed of the ship (the actor the story follows), read at the playhead. */
function Readout() {
  const ev = replayEvent.value;
  const t = replayT.value;
  if (!ev) return null;
  const s = ev.actors.find((a) => a.kind === 'ship')?.at(t);
  const alt = s ? (s.altM >= 1000 ? `${nf.format(s.altM / 1000)} km` : `${nf.format(s.altM)} m`) : '–';
  const v = s ? (s.speedMs >= 1000 ? `${nf1.format(s.speedMs / 1000)} km/s` : `${nf.format(s.speedMs * 3.6)} km/h`) : '–';
  return (
    <div class="rp-read num" aria-live="off">
      <span class="rp-t">{tLabel(t)}</span>
      <span><small>Höhe</small> {alt}</span>
      <span><small>Tempo</small> {v}</span>
    </div>
  );
}

function Scrubber() {
  const ev = replayEvent.value!;
  const pos = scrubPos(ev, replayT.value);
  const ticks = useMemo(() => ev.markers.map((m) => ({ ...m, x: scrubPos(ev, m.t) })), [ev]);
  const bounds = useMemo(() => ev.phases.map((p, i) => ({ id: p.id, label: p.label, x: i / ev.phases.length })), [ev]);
  return (
    <div class="rp-scrub">
      <input
        type="range"
        class="rp-range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(pos * 1000)}
        aria-label="Zeitpunkt im Ereignis"
        onInput={(e) => seekReplay(scrubTime(ev, Number((e.currentTarget as HTMLInputElement).value) / 1000))}
      />
      <div class="rp-ticks" aria-hidden="false">
        {bounds.map((b) => <span key={b.id} class="rp-bound" style={{ left: `${b.x * 100}%` }} />)}
        {ticks.map((m) => (
          <button key={m.t} type="button" class="rp-mark" style={{ left: `${m.x * 100}%` }} aria-label={`${m.label}, ${tLabel(m.t)}`} onClick={() => seekReplay(m.t)} {...tipProps(`${m.label} · ${tLabel(m.t)}`, undefined, 'top')} />
        ))}
      </div>
    </div>
  );
}

export function ReplayBar({ mobile }: { mobile?: boolean }) {
  const ev = replayEvent.value;
  const loading = replayLoading.value;
  const error = replayError.value;
  if (!ev && !loading && !error) return null;
  if (!ev) {
    return (
      <div class={`rp-wrap ${mobile ? 'is-mobile' : ''}`}>
        <div class="cap replay-bar" role="status">
          <div class="rp-head">
            <span class="rp-title">{error ?? 'Ereignis wird geladen …'}</span>
            {error && <IconButton icon="close" label="Schließen" variant="ghost" onClick={closeReplay} />}
          </div>
        </div>
      </div>
    );
  }
  const phase = phaseAt(ev, replayT.value);
  const playing = replayPlaying.value;
  const auto = replayAuto.value;
  const manual = replaySpeed.value;
  const eff = replayEffectiveSpeed.value;
  const noPro = !proAvailable || !proEnabled.value;
  const focus = replayFocus.value;
  const cams = [
    ...ev.actors.filter((a) => a.kind !== 'satellite').map((a) => ({ id: a.id, label: a.kind === 'booster' ? 'Booster' : 'Ship' })),
    ...(ev.actors.some((a) => a.kind === 'satellite') ? [{ id: 'sat1', label: 'Starlink' }] : []),
  ];
  return (
    <div class={`rp-wrap ${mobile ? 'is-mobile' : ''}`}>
    <EngineStatus />
    <section class="cap replay-bar" aria-label={`Wiederholung: ${ev.title}`}>
      <div class="rp-head">
        <div class="rp-titles">
          <span class="rp-title">{ev.title}</span>
          <span class="rp-phase">{phase.label}</span>
        </div>
        <Readout />
        <IconButton icon="close" label="Wiederholung beenden" shortcut="Esc" variant="ghost" onClick={closeReplay} />
      </div>
      <p class="rp-info">{noPro ? 'Die 3D-Ansicht braucht Orbis Pro (in den Einstellungen einschalten).' : phase.info}</p>
      <Scrubber />
      <div class="rp-controls">
        <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Abspielen'} shortcut="Space" variant="ghost" class="rp-play" onClick={toggleReplay} />
        <div class="rp-speeds" role="group" aria-label="Geschwindigkeit">
          <button type="button" class="rp-chip" aria-pressed={auto} onClick={() => (replayAuto.value = true)} title="Die Regie wählt je Abschnitt">
            Auto{auto ? ` · ${speedLabel(Math.round(eff))}` : ''}
          </button>
          {REPLAY_SPEEDS.map((s) => (
            <button key={s} type="button" class="rp-chip" aria-pressed={!auto && manual === s} onClick={() => setReplaySpeed(s)}>
              {speedLabel(s)}
            </button>
          ))}
        </div>
      </div>
      <div class="rp-cams" role="group" aria-label="Kamera">
        <span class="rp-cams-label">Kamera</span>
        <button type="button" class="rp-chip" aria-pressed={focus === null} onClick={() => setReplayFocus(null)} {...tipProps('Die Regie wählt den Blickpunkt', undefined, 'top')}>Regie</button>
        {cams.map((c) => (
          <button key={c.id} type="button" class="rp-chip" aria-pressed={focus === c.id || (c.id === 'sat1' && focus?.startsWith('sat') === true)} onClick={() => setReplayFocus(c.id)}>{c.label}</button>
        ))}
        <span class="rp-cams-hint">oder ein Fahrzeug in der Karte anklicken</span>
      </div>
      <details class="rp-more">
        <summary>Originalvideos, Quellen, Hinweis</summary>
        <p class="rp-note">{ev.note}</p>
        <ul class="rp-links">
          {ev.links.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                {l.label} <Icon name="external" size={12} />
              </a>
              {l.kind === 'official' && <span class="rp-tag">offiziell</span>}
            </li>
          ))}
        </ul>
        <p class="rp-src">
          Quellen:{' '}
          {ev.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && ', '}
              <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>
            </span>
          ))}
        </p>
      </details>
    </section>
    </div>
  );
}
