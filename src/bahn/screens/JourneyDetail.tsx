import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../ui/icons';
import { LineBadge, PlatformSign } from '../ui/Badges';
import { Header, IconButton } from '../ui/parts';
import { Screen } from '../ui/Sheet';
import { useScene } from '../ui/scene';
import { detent } from '../ui/sheetState';
import { journeyMap, legIndex, stopOfCall } from '../ui/mapData';
import { cssModeColor } from '../ui/mapLayers';
import { clock, delayState, delayText, duration, transfersText } from '../ui/format';
import type { Call, Journey, Leg } from '../data/types';
import { openStop, push, replaceTop } from '../state/nav';
import { findTrip, saveTrip } from '../state/trips';
import type { SavedTrip } from '../data/savedTrips';

/**
 * Verbindungsdetail: ein Abschnitt je Karte, dazwischen die Umstiege. Antippen eines Abschnitts (auch auf der Karte)
 * hebt ihn hervor und zeigt seine Strecke.
 */
export function JourneyDetail({ journey: j, saved, children }: { journey: Journey; /** shown as a saved connection */ saved?: SavedTrip; children?: ComponentChildren }) {
  const [focus, setFocus] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const known = saved ?? findTrip(j);
  const keep = () => {
    const result = known ?? saveTrip(j);
    if (result === 'full') setSaveError('Du hast schon 30 Verbindungen gespeichert. Entferne zuerst eine in der Merkliste.');
    else if (result === 'storage') setSaveError('Speichern fehlgeschlagen: Der Speicher des Geräts ist voll oder gesperrt.');
    else replaceTop({ kind: 'saved', id: result.id });
  };
  const cards = useRef<(HTMLElement | null)[]>([]);
  const map = useMemo(() => journeyMap(j, cssModeColor, focus), [j, focus]);
  const fromMap = useRef(false);
  useScene({
    ...map,
    onRoute: (id) => {
      fromMap.current = true;
      setFocus(legIndex(id));
      if (detent.peek() === 'peek') detent.value = 'half';
    },
  });

  // nach einem Tipp auf die Karte den Abschnitt in die Liste holen
  useEffect(() => {
    if (focus === null || !fromMap.current) return;
    fromMap.current = false;
    cards.current[focus]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focus]);

  const first = j.legs[0]!;
  const last = j.legs[j.legs.length - 1]!;
  const share = () => {
    const text = `${first.from.name} ${clock(j.departure.planned)} → ${last.to.name} ${clock(j.arrival.planned)}`;
    if (navigator.share) void navigator.share({ title: 'Verbindung', text }).catch(() => undefined);
    else void navigator.clipboard?.writeText(text);
  };
  const delay = delayText(j.arrival) || delayText(j.departure);
  const late = delayState(j.arrival) === 'late' || delayState(j.departure) === 'late';

  const show = (i: number) => {
    setFocus(focus === i ? null : i);
    if (detent.peek() === 'full') detent.value = 'half';
  };

  return (
    <Screen
      label="Verbindung"
      head={
        <>
          <Header
            title={<span class="bn-times">{clock(j.departure.actual)} – {clock(j.arrival.actual)}</span>}
            subtitle={`${new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }).format(j.departure.planned)} · ${duration(j.arrival.actual - j.departure.actual)} · ${transfersText(j.transfers)}`}
            actions={<IconButton icon="share" label="Teilen" onClick={share} />}
          />
          {!saved && (
            <div class="bn-actions">
              <button type="button" class={`bn-btn ${known ? 'bn-btn-tonal' : 'bn-btn-filled'}`} onClick={keep}>
                <Icon name="star" size={18} />{known ? 'Gespeichert · Einstellungen' : 'Offline speichern'}
              </button>
            </div>
          )}
          {(late || j.legs.some((l) => l.cancelled)) && (
            <div class="bn-chips">
              {late && <span class="bn-tag bn-tag-late">{delay} min Verspätung</span>}
              {j.legs.some((l) => l.cancelled) && <span class="bn-tag bn-tag-late">Ein Teil fällt aus</span>}
            </div>
          )}
        </>
      }
    >
      {saveError && <p class="bn-warning" role="alert">{saveError}</p>}
      {children}
      <ol class="bn-trip">
        {j.legs.map((l, i) => {
          const before = j.legs[i - 1];
          const after = j.legs[i + 1];
          // ein Fußweg zwischen zwei Fahrten ist ein Umstieg: seine Zeit steht an ihm
          const change = l.mode === 'fuss' && before && after && before.mode !== 'fuss' && after.mode !== 'fuss'
            ? Math.max(0, Math.round((after.from.time.actual - before.to.time.actual) / 60000))
            : undefined;
          return (
            <li key={i} ref={(el) => { cards.current[i] = el; }}>
              {before && before.mode !== 'fuss' && l.mode !== 'fuss' && <Transfer arrival={before.to} departure={l.from} />}
              {l.mode === 'fuss'
                ? <WalkCard leg={l} change={change} active={focus === i} onShow={() => show(i)} />
                : <RideCard leg={l} active={focus === i} onShow={() => show(i)} />}
            </li>
          );
        })}
      </ol>
    </Screen>
  );
}

function Transfer({ arrival, departure }: { arrival: Call; departure: Call }) {
  const wait = Math.max(0, Math.round((departure.time.actual - arrival.time.actual) / 60000));
  const change = arrival.platform && departure.platform && arrival.platform !== departure.platform;
  return (
    <p class={`bn-xfer ${wait < 4 ? 'bn-xfer-tight' : ''}`}>
      <Icon name="recent" size={16} />
      <span><b>{wait} min Umstieg</b>{wait < 4 ? ' · knapp' : ''}{change ? ` · Gleis ${arrival.platform} → ${departure.platform}` : ''}</span>
    </p>
  );
}

/** Ein Halt: Zeit (mit neuer Zeit bei Verspätung), antippbarer Name, Gleis. */
export function CallRow({ call, mode, strong = false }: { call: Call; mode: Leg['mode']; strong?: boolean }) {
  const state = delayState(call.time);
  const stop = stopOfCall(call);
  return (
    <button type="button" class={`bn-call ${strong ? 'bn-call-strong' : ''}`} disabled={!stop} onClick={() => stop && openStop(stop)}>
      <span class="bn-call-time">
        <span class={state === 'late' ? 'bn-struck' : ''}>{clock(call.time.planned)}</span>
        {state === 'late' && <span class="bn-late">{clock(call.time.actual)}</span>}
      </span>
      <span class="bn-call-dot" aria-hidden="true" />
      <span class="bn-call-name">{call.name}</span>
      {mode !== 'fuss' && <PlatformSign platform={call.platform} changed={call.platformChanged} mode={mode} />}
    </button>
  );
}

function RideCard({ leg, active, onShow }: { leg: Leg; active: boolean; onShow: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div class={`bn-ride ${active ? 'bn-active' : ''} ${leg.cancelled ? 'bn-cx' : ''}`} style={{ '--c': `var(--m-${leg.mode})` }}>
      <button type="button" class="bn-ride-head" aria-pressed={active} onClick={onShow}>
        <LineBadge mode={leg.mode} line={leg.line} />
        <span class="bn-ride-dir"><b>{leg.headsign ? `Richtung ${leg.headsign}` : leg.line}</b><small>{[duration(leg.to.time.actual - leg.from.time.actual), leg.agency].filter(Boolean).join(' · ')}</small></span>
        <Icon name="map" size={20} class="bn-dim" />
      </button>
      {leg.cancelled && <p class="bn-warning bn-late">Diese Fahrt fällt aus.</p>}
      {leg.cause && <p class="bn-warning">Grund laut DB: {leg.cause}</p>}
      {leg.notes && (
        <ul class="bn-notes" aria-label="Meldungen der DB zu diesem Zug">
          {leg.notes.map((n) => <li key={n.code}>{n.text}</li>)}
        </ul>
      )}
      {leg.bookingRequired && <p class="bn-warning">Nur mit Anmeldung (Rufbus).</p>}
      <div class="bn-calls">
        <CallRow call={leg.from} mode={leg.mode} strong />
        {leg.via.length > 0 && (
          <button type="button" class="bn-calls-more" aria-expanded={open} onClick={() => setOpen(!open)}>
            {leg.via.length} {leg.via.length > 1 ? 'Zwischenhalte' : 'Zwischenhalt'}<Icon name="chevron" size={16} class={open ? 'bn-flip' : ''} />
          </button>
        )}
        {open && leg.via.map((v, i) => <CallRow key={i} call={v} mode={leg.mode} />)}
        <CallRow call={leg.to} mode={leg.mode} strong />
      </div>
      {leg.tripId && (
        <button type="button" class="bn-btn bn-btn-text" onClick={() => push({ kind: 'trip', tripId: leg.tripId!, line: leg.line, mode: leg.mode, headsign: leg.headsign, at: leg.from.stopId })}>
          Ganzen Linienlauf zeigen
        </button>
      )}
    </div>
  );
}

function WalkCard({ leg, change, active, onShow }: { leg: Leg; /** Minuten zwischen den Fahrten davor und danach */ change?: number; active: boolean; onShow: () => void }) {
  const walk = `${duration(leg.to.time.actual - leg.from.time.actual)} Fußweg${leg.walkM ? ` · ${leg.walkM} m` : ''}`;
  return (
    <button type="button" class={`bn-walk ${change !== undefined && change < 4 ? 'bn-xfer-tight' : ''} ${active ? 'bn-active' : ''}`} aria-pressed={active} onClick={onShow}>
      <Icon name="fuss" size={20} />
      <span>
        <b>{change === undefined ? walk : `${change} min Umstieg${change < 4 ? ' · knapp' : ''}`}</b>
        <small>{change === undefined ? '' : `${walk} · `}nach {leg.to.name}</small>
      </span>
    </button>
  );
}
