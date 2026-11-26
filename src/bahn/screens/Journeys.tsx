import { useEffect, useState } from 'preact/hooks';
import { describeError } from '@/data/http';
import { Icon } from '../ui/icons';
import { MapSheet } from '../ui/MapSheet';
import { NetMap, type MapMarker } from '../ui/NetMap';
import { journeyRoutes, modeColor } from '../ui/routes';
import { LineBadge, PlatformSign } from '../ui/Badges';
import { clock, delayState, delayText, duration } from '../ui/format';
import { plannedJourney } from '../data';
import type { Journey } from '../data/types';
import { sources } from '../state/sources';
import { favorites, recents } from '../state/places';
import { journeyOptions, origin, pop, push, to, when } from '../state/nav';

const keyOf = (j: Journey) => `${j.legs.find((l) => l.mode !== 'fuss')?.line ?? ''}|${Math.round(j.departure.planned / 60000)}|${Math.round(j.arrival.planned / 60000)}`;

/** Verbindungsliste Start → Ziel, mit früher/später nachladen und DB-Echtzeit. */
export function JourneysScreen() {
  const from = origin.value;
  const dest = to.value;
  const [list, setList] = useState<Journey[]>([]);
  const [cursors, setCursors] = useState<{ earlier?: string; later?: string }>({});
  const [state, setState] = useState<{ loading: boolean; error?: string }>({ loading: true });
  const [more, setMore] = useState<'earlier' | 'later' | null>(null);

  const w = when.value;

  const enrich = (journeys: Journey[], signal: AbortSignal, set: (j: Journey[]) => void) => {
    if (!sources.delays) return;
    sources.delays.journeys(journeys, signal).then((merged) => !signal.aborted && set(merged), () => undefined);
  };

  useEffect(() => {
    if (!from || !dest) return;
    const ctl = new AbortController();
    setState({ loading: true });
    setList([]);
    sources.transit.journeys(from, dest, journeyOptions(), undefined, ctl.signal).then(
      (page) => {
        if (ctl.signal.aborted) return;
        const shown = sources.delays ? page.journeys.map(plannedJourney) : page.journeys;
        setList(shown);
        setCursors({ earlier: page.earlier, later: page.later });
        setState({ loading: false });
        if (page.journeys.length && from.name !== 'Mein Standort') recents.add({ kind: 'route', from, to: dest });
        enrich(page.journeys, ctl.signal, (merged) => setList(merged));
      },
      (e: unknown) => !ctl.signal.aborted && setState({ loading: false, error: describeError(e) }),
    );
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.id, dest?.id, w.time, w.arriveBy]);

  const loadMore = async (dir: 'earlier' | 'later') => {
    const cursor = cursors[dir];
    if (!from || !dest || !cursor || more) return;
    setMore(dir);
    try {
      const page = await sources.transit.journeys(from, dest, journeyOptions(), cursor);
      const fresh = page.journeys.filter((j) => !list.some((x) => keyOf(x) === keyOf(j)));
      const shown = sources.delays ? fresh.map(plannedJourney) : fresh;
      setList((cur) => (dir === 'earlier' ? [...shown, ...cur] : [...cur, ...shown]));
      setCursors((c) => ({ ...c, [dir]: dir === 'earlier' ? page.earlier : page.later }));
      if (sources.delays) {
        const merged = await sources.delays.journeys(fresh);
        setList((cur) => cur.map((j) => merged.find((m) => keyOf(m) === keyOf(j)) ?? j));
      }
    } catch (e) {
      setState((s) => ({ ...s, error: describeError(e) }));
    } finally {
      setMore(null);
    }
  };

  if (!from || !dest) return null;
  const routeSaved = favorites.has({ kind: 'route', from, to: dest });
  const first = list[0];
  const ends: MapMarker[] = [
    { id: 'from', lng: from.lng, lat: from.lat, kind: 'start' },
    { id: 'to', lng: dest.lng, lat: dest.lat, kind: 'end' },
  ];

  return (
    <div class="bn-screen">
      <MapSheet
        map={<NetMap markers={ends} routes={first ? journeyRoutes(first) : []} fit interactive={false} />}
        header={
          <>
            <div class="bn-ms-head">
              <button type="button" class="bn-iconbtn" aria-label="Zurück" onClick={pop}><Icon name="back" /></button>
              <div class="bn-toprt"><span>{from.name}</span><Icon name="back" size={14} class="bn-flip bn-dim" /><span>{dest.name}</span></div>
              {from.name !== 'Mein Standort' && (
                <button type="button" class={`bn-iconbtn ${routeSaved ? 'bn-starred' : ''}`} aria-label="Strecke merken" aria-pressed={routeSaved} onClick={() => favorites.toggle({ kind: 'route', from, to: dest })}><Icon name="star" /></button>
              )}
            </div>
            <div class="bn-small bn-timeline-note">{w.arriveBy ? 'Ankunft' : 'Abfahrt'} {w.time ? new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(w.time) : 'jetzt'}</div>
          </>
        }
      >
        {cursors.earlier && <button type="button" class="bn-more" disabled={!!more} onClick={() => void loadMore('earlier')}>{more === 'earlier' ? 'Lädt …' : '⬆ Frühere Verbindungen'}</button>}
        {state.loading && <p class="bn-note">Suche Verbindungen …</p>}
        {state.error && <p class="bn-note bn-late">{state.error}</p>}
        {!state.loading && !state.error && list.length === 0 && <p class="bn-note">Keine Verbindung gefunden. Probiere andere Zeiten oder weniger Filter.</p>}
        {list.map((j) => <JourneyCard key={keyOf(j)} j={j} onClick={() => push({ kind: 'journey', journey: j })} />)}
        {cursors.later && <button type="button" class="bn-more" disabled={!!more} onClick={() => void loadMore('later')}>{more === 'later' ? 'Lädt …' : 'Spätere Verbindungen ⬇'}</button>}
      </MapSheet>
    </div>
  );
}

function JourneyCard({ j, onClick }: { j: Journey; onClick: () => void }) {
  const cancelled = j.legs.some((l) => l.cancelled);
  const rides = j.legs.filter((l) => l.mode !== 'fuss');
  const total = Math.max(1, j.arrival.actual - j.departure.actual);
  const depState = delayState(j.departure);
  const arrState = delayState(j.arrival);
  const worst = Math.max(j.departure.delayMin ?? 0, j.arrival.delayMin ?? 0);
  return (
    <button type="button" class={`bn-conn ${cancelled ? 'bn-cx' : ''}`} onClick={onClick}>
      <div class="bn-conn-t">
        <span class={depState === 'late' ? 'bn-late' : ''}>{clock(j.departure.actual)}</span>
        <span class="bn-ar">→</span>
        <span class={arrState === 'late' ? 'bn-late' : ''}>{clock(j.arrival.actual)}</span>
        <span class="bn-conn-d">{duration(j.arrival.actual - j.departure.actual)}</span>
      </div>
      <div class="bn-bar">
        {j.legs.map((l, i) => <span key={i} style={{ flex: Math.max(0.04, (l.to.time.actual - l.from.time.actual) / total), background: l.mode === 'fuss' ? 'var(--ink-3)' : modeColor(l.mode) }} />)}
      </div>
      <div class="bn-conn-meta">
        {rides.slice(0, 3).map((l, i) => <LineBadge key={i} mode={l.mode} line={l.line} />)}
        {rides.length > 3 && <span class="bn-small">+{rides.length - 3}</span>}
        <span class="bn-small">{j.transfers === 0 ? 'Direkt' : `${j.transfers} Umstieg${j.transfers > 1 ? 'e' : ''}`}</span>
        {cancelled ? <span class="bn-late">Ausfall</span> : worst >= 2 ? <span class="bn-late">{delayText(j.departure) || delayText(j.arrival)} min</span> : j.delaySource === 'db' ? <span class="bn-ok">pünktlich</span> : null}
        {rides[0]?.from.platform && <span class="bn-conn-gl"><PlatformSign platform={rides[0].from.platform} changed={rides[0].from.platformChanged} mode={rides[0].mode} /></span>}
      </div>
    </button>
  );
}
