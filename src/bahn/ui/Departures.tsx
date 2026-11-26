import { useState } from 'preact/hooks';
import type { Departure, ModeGroup, Stop } from '../data/types';
import { push } from '../state/nav';
import { useDepartures, useNow } from '../state/hooks';
import { LineBadge, PlatformSign } from './Badges';
import { Chip, Empty, ErrorState, SavedNote, Skeleton } from './parts';
import { clock, delayState, delayText, inMinutes } from './format';

/** Abfahrt: Linie und Ziel, darunter Zeit und Gleis, rechts der Countdown. Antippen zeigt den Linienlauf. */
export function DepartureRow({ d, now, at }: { d: Departure; now: number; at: Stop }) {
  const state = delayState(d.time);
  const open = d.tripId ? () => push({ kind: 'trip', tripId: d.tripId!, line: d.line, mode: d.mode, headsign: d.headsign, at: at.id }) : undefined;
  return (
    <button type="button" class={`bn-dep ${d.cancelled ? 'bn-cx' : ''}`} onClick={open} disabled={!open}>
      <LineBadge mode={d.mode} line={d.line} />
      <span class="bn-dep-main">
        <b>{d.headsign}</b>
        <small>
          <span class="bn-dep-time">{clock(d.time.planned)}</span>
          {!d.cancelled && delayText(d.time) && <span class={state === 'late' ? 'bn-late' : 'bn-ok'}>{delayText(d.time)}</span>}
          <PlatformSign platform={d.platform} changed={d.platformChanged} mode={d.mode} />
        </small>
      </span>
      <span class={`bn-dep-when ${d.cancelled || state === 'late' ? 'bn-late' : state === 'ok' ? 'bn-ok' : ''}`}>{d.cancelled ? 'Ausfall' : inMinutes(d.time.actual, now)}</span>
    </button>
  );
}

const FILTERS: { id: string; label: string; modes: ModeGroup[] }[] = [
  { id: 'all', label: 'Alle', modes: [] },
  { id: 'fern', label: 'Fernverkehr', modes: ['fern', 'fernbus'] },
  { id: 'regio', label: 'Regional', modes: ['regio'] },
  { id: 'sbahn', label: 'S-Bahn', modes: ['sbahn'] },
  { id: 'ubahn', label: 'U-Bahn', modes: ['ubahn'] },
  { id: 'tram', label: 'Tram', modes: ['tram'] },
  { id: 'bus', label: 'Bus', modes: ['bus'] },
  { id: 'faehre', label: 'Fähre', modes: ['faehre'] },
];

/** Abfahrten einer Haltestelle mit Filtern (nur für Verkehrsmittel, die vorkommen). */
export function DepartureList({ stop }: { stop: Stop }) {
  const [filter, setFilter] = useState('all');
  const now = useNow(15_000);
  const { list, loading, error, updated, saved } = useDepartures(stop, 40);
  const available = FILTERS.filter((f) => !f.modes.length || list.some((d) => f.modes.includes(d.mode)));
  const active = available.find((f) => f.id === filter) ?? FILTERS[0]!;
  const shown = list.filter((d) => !active.modes.length || active.modes.includes(d.mode));

  return (
    <>
      {available.length > 2 && (
        <div class="bn-chips">
          {available.map((f) => <Chip key={f.id} pressed={active.id === f.id} onClick={() => setFilter(f.id)}>{f.label}</Chip>)}
        </div>
      )}
      {saved && updated && <SavedNote at={updated} now={now} />}
      {loading && list.length === 0 && <Skeleton rows={6} />}
      {error && list.length === 0 && <ErrorState message={error} />}
      {!loading && (!error || saved) && shown.length === 0 && (
        <Empty icon="clock" title={saved ? 'Keine gespeicherten Abfahrten mehr' : 'Keine Abfahrten'} text={saved ? 'Sobald du online bist, geht es weiter.' : 'In den nächsten Stunden fährt hier nichts.'} />
      )}
      <div class="bn-list">
        {shown.map((d, i) => <DepartureRow key={`${d.line}${d.time.planned}${i}`} d={d} now={now} at={stop} />)}
      </div>
    </>
  );
}
