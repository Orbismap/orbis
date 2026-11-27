import { createPortal } from 'preact/compat';
import { useRef, useState } from 'preact/hooks';
import { setLayerVisible } from '../../../karten/active';
import type { LayerDef } from '../../../layers/types';
import { eventCard } from '../../../replay/card';
import { REPLAY_EVENTS, type ReplayListing } from '../../../replay/events';
import { playReplay } from '../../../state/replay';
import { selectCard } from '../../../state/selection';
import { layerStatus } from '../../../state/session';
import { IconButton } from '../../../ui/Button';
import { Icon } from '../../../ui/icons/Icon';
import { Popover } from '../../../ui/Popover';
import { Switch } from '../../../ui/Switch';
import { formatCompact } from '../../../core/format';
import { CADENCE_LABEL } from '../../catalog/fuzzy';
import { flyToPoint } from '../../shared/map';
import { SourceList } from '../LayerDetails';
import type { LayerPageProps } from '../page-kit';
import './replay-page.css';

const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
const dateOf = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** Opens the details page of an event (its card) and shows its place on the map. */
async function openEvent(def: LayerDef, listing: ReplayListing) {
  const ev = await listing.load();
  selectCard(def.id, eventCard(ev, (at) => playReplay(ev.id, at)));
  flyToPoint(ev.pad[0], ev.pad[1], 5);
}

function EventCard({ def, e, first }: { def: LayerDef; e: ReplayListing; first: boolean }) {
  return (
    <li class={`rpg-card${first ? ' is-first' : ''}`}>
      {e.cover && <img class="rpg-img" src={e.cover} alt="" loading={first ? 'eager' : 'lazy'} decoding="async" draggable={false} />}
      <div class="rpg-scrim" aria-hidden="true" />
      <h4 class="rpg-title">{e.title}</h4>
      <ul class="rpg-chips" aria-label="Kennzahlen">
        <li class="num">{dateOf(e.t0)}</li>
        {e.badges.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      {/* the whole picture opens the details; the round button in the middle (on hover) starts the replay at once */}
      <button type="button" class="rpg-open" aria-label={`Details zu ${e.title}`} onClick={() => void openEvent(def, e)} />
      <button type="button" class="rpg-play" aria-label={`${e.title}: Wiederholung starten`} onClick={() => playReplay(e.id)}>
        <Icon name="play" size={44} />
      </button>
    </li>
  );
}

/** The panel page of the layer "Live-Wiederholungen": a plain title and a big list of the events, each a picture with its title. */
export default function Wiederholungen({ layer, def, karteId }: LayerPageProps) {
  const anchor = useRef<HTMLDivElement>(null);
  const menuEl = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState(false);
  // the info card is portalled out of the scrolling, clipping panel (it would scroll with the events and be cut off at the edge),
  // so "outside" spans both the button and the card
  const both = { get current() { return { contains: (n: Node) => !!(anchor.current?.contains(n) || menuEl.current?.contains(n)) } as HTMLElement; } };
  const r = info ? anchor.current?.getBoundingClientRect() : undefined;
  const st = layerStatus.value[def.id];
  const events = [...REPLAY_EVENTS].sort((a, b) => b.t0 - a.t0);
  return (
    <div class="rpg">
      <header class="rpg-head">
        <p class="rpg-h">Vergangene Ereignisse noch einmal erleben</p>
        <div class="rpg-info" ref={anchor}>
          <IconButton icon="info" label="Über diese Ebene" variant="ghost" pressed={info} onClick={() => setInfo(!info)} />
          {r &&
            createPortal(
              <div ref={menuEl} class="rpg-popwrap" style={{ top: `${r.bottom + 6}px`, right: `${window.innerWidth - r.right}px` }}>
                <Popover open={info} onClose={() => setInfo(false)} align="end" label="Über diese Ebene" anchorRef={both} class="rpg-pop">
              <p class="rpg-pop-text">{def.summary}. Die Bahnen zwischen den bekannten Zeitpunkten sind modelliert, es gibt keine öffentliche Telemetrie.</p>
              <Switch class="rpg-pop-switch" label="Auf der Karte zeigen" checked={layer.visible} onChange={(v) => setLayerVisible(karteId, def.id, v)} />
              <dl class="rpg-pop-facts">
                <div><dt>Abdeckung</dt><dd>{def.coverage ?? 'Welt'}</dd></div>
                <div><dt>Aktualisierung</dt><dd>{CADENCE_LABEL[def.cadence]}</dd></div>
                <div><dt>Ereignisse</dt><dd class="num">{formatCompact(st?.count ?? events.length)}</dd></div>
              </dl>
              <SourceList def={def} />
                </Popover>
              </div>,
              document.body,
            )}
        </div>
      </header>
      <ol class="rpg-list" aria-label="Ereignisse">
        {events.map((e, i) => (
          <EventCard key={e.id} def={def} e={e} first={i === 0} />
        ))}
      </ol>
      {events.length === 1 && <p class="rpg-more">Weitere Ereignisse folgen.</p>}
    </div>
  );
}
