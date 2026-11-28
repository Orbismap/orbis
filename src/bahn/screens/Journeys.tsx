import { useEffect, useMemo, useState } from 'preact/hooks';
import { cardNotes, provenOnTime } from '../data/delays';
import { NoteIcons } from '../ui/Notes';
import { online } from '@/core/online';
import { describeError } from '@/data/http';
import { Icon, modeIcon } from '../ui/icons';
import { Screen } from '../ui/Sheet';
import { useScene } from '../ui/scene';
import { journeyMap } from '../ui/mapData';
import { cssModeColor } from '../ui/mapLayers';
import { Chip, Empty, ErrorState, IconButton, SavedNote, Skeleton } from '../ui/parts';
import { PlatformSign } from '../ui/Badges';
import { clock, delayState, delayText, duration, inMinutes, transfersText } from '../ui/format';
import { MODE_GROUPS, plannedJourney } from '../data';
import { saveJourneys, savedJourneys } from '../data/offline';
import type { Journey, Leg } from '../data/types';
import { sources } from '../state/sources';
import { favorites, recents } from '../state/places';
import { journeyOptions, modes, origin, pop, push, swapEnds, to, when } from '../state/nav';
import { useNow } from '../state/hooks';

export const journeyKey = (j: Journey) => `${j.legs.find((l) => l.mode !== 'fuss')?.line ?? ''}|${Math.round(j.departure.planned / 60000)}|${Math.round(j.arrival.planned / 60000)}`;

/** Verbindungsliste Start → Ziel: Strecke, Zeit und Filter im Kopf, früher/später nachladen, DB-Echtzeit. */
export function JourneysScreen() {
  const start = origin.value;
  const dest = to.value;
  const [list, setList] = useState<Journey[]>([]);
  const [cursors, setCursors] = useState<{ earlier?: string; later?: string }>({});
  const [state, setState] = useState<{ loading: boolean; error?: string }>({ loading: true });
  const [more, setMore] = useState<'earlier' | 'later' | null>(null);
  const [retry, setRetry] = useState(0);
  // Desktop: Fährt man über eine Verbindung, zeigt die Karte deren Strecke.
  const [hover, setHover] = useState<Journey | null>(null);
  const now = useNow();

  const w = when.value;
  const wanted = modes.value.join(',');
  const net = online.value;
  /** Wann die gezeigten gespeicherten Verbindungen ankamen; null, sobald die Quelle geantwortet hat. */
  const [savedAt, setSavedAt] = useState<number | null>(null);

  /** Zeigt die Liste und behält sie für die Zeit ohne Netz. */
  const keep = (change: (cur: Journey[]) => Journey[]) =>
    setList((cur) => {
      const next = change(cur);
      if (start && dest) saveJourneys(start, dest, journeyOptions(), next);
      return next;
    });

  useEffect(() => {
    if (!start || !dest) {
      setList([]);
      setState({ loading: false });
      return;
    }
    const ctl = new AbortController();
    const kept = savedJourneys(start, dest, journeyOptions(), w.time);
    setState({ loading: true });
    setList(kept?.data ?? []);
    setSavedAt(kept?.at ?? null);
    setCursors({});
    sources.transit.journeys(start, dest, journeyOptions(), undefined, ctl.signal).then(
      (page) => {
        if (ctl.signal.aborted) return;
        const planned = sources.delays ? page.journeys.map(plannedJourney) : page.journeys;
        keep(() => planned);
        setSavedAt(null);
        setCursors({ earlier: page.earlier, later: page.later });
        setState({ loading: false });
        if (page.journeys.length && start.name !== 'Mein Standort') recents.add({ kind: 'route', from: start, to: dest });
        sources.delays?.journeys(page.journeys, ctl.signal).then((merged) => !ctl.signal.aborted && keep(() => merged), () => undefined);
      },
      (e: unknown) => !ctl.signal.aborted && setState({ loading: false, error: describeError(e) }),
    );
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start?.id, dest?.id, w.time, w.arriveBy, wanted, net, retry]);

  const loadMore = async (dir: 'earlier' | 'later') => {
    const cursor = cursors[dir];
    if (!start || !dest || !cursor || more) return;
    setMore(dir);
    try {
      const page = await sources.transit.journeys(start, dest, journeyOptions(), cursor);
      const fresh = page.journeys.filter((j) => !list.some((x) => journeyKey(x) === journeyKey(j)));
      const shown = sources.delays ? fresh.map(plannedJourney) : fresh;
      keep((cur) => (dir === 'earlier' ? [...shown, ...cur] : [...cur, ...shown]));
      setCursors((c) => ({ ...c, [dir]: dir === 'earlier' ? page.earlier : page.later }));
      if (sources.delays) {
        const merged = await sources.delays.journeys(fresh);
        keep((cur) => cur.map((j) => merged.find((m) => journeyKey(m) === journeyKey(j)) ?? j));
      }
    } catch (e) {
      setState((s) => ({ ...s, error: describeError(e) }));
    } finally {
      setMore(null);
    }
  };

  const shown = hover ?? list[0];
  const map = useMemo(() => (shown ? journeyMap(shown, cssModeColor) : undefined), [shown]);
  const ends: [number, number][] = start && dest ? [[start.lng, start.lat], [dest.lng, dest.lat]] : [];
  useScene({
    ...(map ?? { stops: start && dest ? [{ stop: start, kind: 'start' }, { stop: dest, kind: 'end' }] : [], fit: ends }),
    onRoute: () => shown && push({ kind: 'journey', journey: shown }),
  });

  return (
    <Screen label="Verbindungen" head={<RouteHead />}>
      {savedAt !== null && list.length > 0 && <SavedNote at={savedAt} />}
      {state.error && <ErrorState message={state.error} onRetry={() => setRetry(retry + 1)} />}
      {state.loading && list.length === 0 && <Skeleton rows={3} card />}
      {!state.loading && !state.error && list.length === 0 && (
        start && dest
          ? <Empty icon="search" title="Keine Verbindung gefunden" text="Probiere eine andere Zeit oder erlaube mehr Verkehrsmittel." />
          : <Empty icon="search" title="Start und Ziel wählen" text="Tippe oben auf das freie Feld." />
      )}
      {cursors.earlier && <button type="button" class="bn-btn bn-btn-text bn-btn-wide" disabled={!!more} onClick={() => void loadMore('earlier')}>{more === 'earlier' ? 'Lädt …' : 'Frühere Verbindungen'}</button>}
      <div class="bn-conns">
        {list.map((j) => <JourneyCard key={journeyKey(j)} j={j} now={now} onClick={() => push({ kind: 'journey', journey: j })} onHover={setHover} />)}
      </div>
      {cursors.later && <button type="button" class="bn-btn bn-btn-text bn-btn-wide" disabled={!!more} onClick={() => void loadMore('later')}>{more === 'later' ? 'Lädt …' : 'Spätere Verbindungen'}</button>}
    </Screen>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Kopf der Suche: Start und Ziel (antippen ändert), tauschen, merken, Zeit und Verkehrsmittel. */
function RouteHead() {
  const [open, setOpen] = useState<'time' | 'filter' | null>(null);
  const start = origin.value;
  const dest = to.value;
  const w = when.value;
  const toggle = (id: 'time' | 'filter') => setOpen((cur) => (cur === id ? null : id));
  const route = start && dest ? ({ kind: 'route', from: start, to: dest } as const) : null;
  const saved = route ? favorites.has(route) : false;
  const timeText = w.time
    ? `${w.arriveBy ? 'An' : 'Ab'} ${new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(w.time)}`
    : w.arriveBy ? 'Ankunft jetzt' : 'Abfahrt jetzt';

  return (
    <>
      <div class="bn-routehead">
        <IconButton icon="back" label="Zurück" onClick={pop} />
        <div class="bn-fields">
          <button type="button" class="bn-field" onClick={() => push({ kind: 'search', target: 'from' })}>
            <span class="bn-dot" aria-hidden="true" /><span class="bn-sr">Start: </span><span>{start?.name ?? 'Start wählen'}</span>
          </button>
          <button type="button" class="bn-field" onClick={() => push({ kind: 'search', target: 'to' })}>
            <span class="bn-dot bn-dot-end" aria-hidden="true" /><span class="bn-sr">Ziel: </span><span>{dest?.name ?? 'Ziel wählen'}</span>
          </button>
        </div>
        <IconButton icon="swap" label="Start und Ziel tauschen" onClick={swapEnds} />
      </div>
      <div class="bn-chips">
        <Chip icon="clock" expanded={open === 'time'} onClick={() => toggle('time')}>{timeText}</Chip>
        <Chip icon="filter" expanded={open === 'filter'} onClick={() => toggle('filter')}>{modes.value.length ? `Verkehrsmittel · ${modes.value.length}` : 'Verkehrsmittel'}</Chip>
        {route && start!.name !== 'Mein Standort' && <Chip icon="star" pressed={saved} onClick={() => favorites.toggle(route)}>{saved ? 'Gemerkt' : 'Merken'}</Chip>}
      </div>
      {open === 'time' && (
        <div class="bn-options">
          <div class="bn-segments" role="group" aria-label="Zeit gilt für">
            <button type="button" aria-pressed={!w.arriveBy} onClick={() => (when.value = { ...w, arriveBy: false })}>Abfahrt</button>
            <button type="button" aria-pressed={w.arriveBy} onClick={() => (when.value = { ...w, arriveBy: true })}>Ankunft</button>
          </div>
          <input
            type="datetime-local" class="bn-input" aria-label="Datum und Uhrzeit" value={toLocalInput(w.time ?? Date.now())}
            onChange={(e) => {
              const t = Date.parse(e.currentTarget.value);
              when.value = { ...w, time: Number.isFinite(t) ? t : null };
            }}
          />
          <button type="button" class="bn-btn bn-btn-tonal" onClick={() => { when.value = { time: null, arriveBy: false }; setOpen(null); }}>Jetzt</button>
        </div>
      )}
      {open === 'filter' && (
        <div class="bn-options bn-chips bn-chips-wrap" role="group" aria-label="Nur diese Verkehrsmittel (keine Auswahl: alle)">
          {MODE_GROUPS.map((g) => (
            <Chip key={g.id} pressed={modes.value.includes(g.id)} onClick={() => (modes.value = modes.value.includes(g.id) ? modes.value.filter((m) => m !== g.id) : [...modes.value, g.id])}>{g.label}</Chip>
          ))}
        </div>
      )}
    </>
  );
}

const minutes = (l: Leg) => Math.max(0, (l.to.time.actual - l.from.time.actual) / 60000);

/** Ergebnis: Zeiten und Dauer, der Verlauf als Balken in den Linienfarben, darunter Abfahrtsort, Umstiege und Status. */
function JourneyCard({ j, now, onClick, onHover }: { j: Journey; now: number; onClick: () => void; onHover: (j: Journey | null) => void }) {
  const cancelled = j.legs.some((l) => l.cancelled);
  const first = j.legs.find((l) => l.mode !== 'fuss');
  const worst = Math.max(j.departure.delayMin ?? 0, j.arrival.delayMin ?? 0);
  const notes = cardNotes(j);
  // „in 5 min“ gilt der Abfahrt des ersten Fahrzeugs, nicht dem Losgehen davor
  const soon = first ? first.from.time.actual - now : -Infinity;
  // kurze Fußwege nehmen im Balken keinen Platz weg
  const bar = j.legs.filter((l) => l.mode !== 'fuss' || minutes(l) >= 4);
  return (
    <button type="button" class={`bn-conn ${cancelled ? 'bn-cx' : ''}`} onClick={onClick} onMouseEnter={() => onHover(j)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(j)} onBlur={() => onHover(null)}>
      <span class="bn-conn-top">
        <span class="bn-conn-times">
          <b class={delayState(j.departure) === 'late' ? 'bn-late' : ''}>{clock(j.departure.actual)}</b>
          <span aria-label="bis">–</span>
          <b class={delayState(j.arrival) === 'late' ? 'bn-late' : ''}>{clock(j.arrival.actual)}</b>
        </span>
        <span class="bn-conn-dur">{duration(j.arrival.actual - j.departure.actual)}</span>
      </span>
      <span class="bn-legbar">
        {bar.map((l, i) => (
          <span key={i} class={`bn-seg bn-m-${l.mode}`} style={{ flexGrow: Math.max(1, Math.round(minutes(l))) }}>
            {l.mode === 'fuss' ? <Icon name="fuss" size={14} /> : <><Icon name={modeIcon(l.mode, l.vehicle)} size={14} /><span>{l.line}</span></>}
          </span>
        ))}
      </span>
      <span class="bn-conn-meta">
        {first && (
          <span class="bn-conn-from">
            {soon > -60_000 && soon < 60 * 60_000 ? <b>{inMinutes(first.from.time.actual, now)}</b> : null}
            <span>ab {first.from.name}</span>
          </span>
        )}
        <PlatformSign platform={first?.from.platform} changed={first?.from.platformChanged} mode={first?.mode} />
      </span>
      {notes.length > 0 && <NoteIcons notes={notes} />}
      <span class="bn-conn-meta">
        <span>{transfersText(j.transfers)}</span>
        {cancelled ? <span class="bn-tag bn-tag-late">Fällt aus</span> : worst >= 2 ? <span class="bn-tag bn-tag-late">{delayText(j.departure) || delayText(j.arrival)} min</span> : provenOnTime(j) ? <span class="bn-tag bn-tag-ok">pünktlich</span> : null}
      </span>
    </button>
  );
}
