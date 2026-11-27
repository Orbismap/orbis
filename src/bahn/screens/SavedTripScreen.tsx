// A saved connection: it opens without a network, gets real time when there is one, and holds its settings
// (commuter trip, notifications).
import { useEffect, useState } from 'preact/hooks';
import { online } from '@/core/online';
import { formatAge } from '@/core/format';
import { Header } from '../ui/parts';
import { Screen } from '../ui/Sheet';
import { LEADS, MAX_WATCHED, WEEKDAYS, currentRun, defaultDays, type SavedTrip } from '../data/savedTrips';
import { pop } from '../state/nav';
import { enablePush, pushState, syncState, testPush } from '../state/push';
import { refreshTrip, removeTrip, trips, updateTrip } from '../state/trips';
import { useNow } from '../state/hooks';
import { JourneyDetail } from './JourneyDetail';

const REFRESH_MS = 60_000;

export function SavedTripScreen({ id }: { id: string }) {
  const trip = trips.value.find((t) => t.id === id);
  const now = useNow();
  const net = online.value;
  const [failed, setFailed] = useState(false);
  const runKey = trip ? currentRun(trip, now).journey.departure.planned : 0;

  useEffect(() => {
    if (!trip || !net) return;
    const ctl = new AbortController();
    const load = () => !document.hidden && refreshTrip(id, ctl.signal).then(() => setFailed(false), () => !ctl.signal.aborted && setFailed(true));
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      ctl.abort();
      clearInterval(timer);
    };
  }, [id, net, runKey, !!trip]);

  if (!trip) {
    return (
      <Screen label="Gespeicherte Verbindung" head={<Header title="Nicht mehr gespeichert" />}>
        <p class="bn-note">Diese Verbindung wurde entfernt.</p>
      </Screen>
    );
  }
  const run = currentRun(trip, now);
  const state = run.past
    ? 'Diese Fahrt ist vorbei.'
    : run.liveAt
      ? `Echtzeit ${formatAge(run.liveAt, now)}${!net || failed ? ' · gerade nicht aktualisierbar' : ''}`
      : !net
        ? 'Offline · Fahrplan wie gespeichert, ohne Echtzeit'
        : 'Fahrplan ohne Echtzeit';

  return (
    <JourneyDetail journey={run.journey} saved={trip}>
      <p class="bn-saved" role="status">Auf diesem Gerät gespeichert · {state}</p>
      <TripSettings trip={trip} past={run.past} />
    </JourneyDetail>
  );
}

function TripSettings({ trip, past }: { trip: SavedTrip; past: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const push = pushState();
  const notify = trip.notify;
  const days = trip.commute?.days;
  const watching = trips.value.filter((t) => t.notify).length;

  const change = (patch: Partial<SavedTrip>) => {
    setMessage(updateTrip(trip.id, patch) ? null : 'Speichern fehlgeschlagen: Der Speicher des Geräts ist voll oder gesperrt.');
  };

  const toggleNotify = async (on: boolean) => {
    if (!on) return change({ notify: undefined });
    if (watching >= MAX_WATCHED) return setMessage(`Höchstens ${MAX_WATCHED} Verbindungen können benachrichtigen.`);
    setBusy(true);
    try {
      await enablePush();
      change({ notify: { leads: [30, 10], onlyDelay: true } });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Benachrichtigung konnte nicht eingerichtet werden.');
    } finally {
      setBusy(false);
    }
  };

  const test = () => testPush().then(
    () => setMessage('Test-Nachricht ist unterwegs.'),
    () => setMessage('Test fehlgeschlagen. Ist der Push-Dienst erreichbar?'),
  );

  return (
    <div class="bn-card bn-tripset">
      <label class="bn-switch">
        <span><b>Pendlerstrecke</b><small>Gleiche Fahrt an festen Wochentagen</small></span>
        <input type="checkbox" role="switch" checked={!!days} onChange={(e) => change({ commute: e.currentTarget.checked ? { days: defaultDays(trip.journey) } : undefined })} />
      </label>
      {days && (
        <div class="bn-days" role="group" aria-label="Wochentage">
          {WEEKDAYS.map(([d, name]) => (
            <button
              key={d} type="button" aria-pressed={days.includes(d)}
              // one day stays: without any the trip would never run
              onClick={() => { const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]; if (next.length) change({ commute: { days: next } }); }}
            >{name}</button>
          ))}
        </div>
      )}
      <label class="bn-switch">
        <span><b>Bei Verspätung benachrichtigen</b><small>{days ? 'An jedem gewählten Tag' : 'Nur für diese Fahrt'}</small></span>
        <input type="checkbox" role="switch" checked={!!notify} disabled={busy || (!notify && (past || push === 'off'))} onChange={(e) => { const on = e.currentTarget.checked; e.currentTarget.checked = !!notify; void toggleNotify(on); }} />
      </label>
      {notify && (
        <>
          <p class="bn-set-label">Prüfen vor Abfahrt</p>
          <div class="bn-days" role="group" aria-label="Minuten vor Abfahrt">
            {LEADS.map((m) => (
              <button
                key={m} type="button" aria-pressed={notify.leads.includes(m)}
                onClick={() => { const leads = notify.leads.includes(m) ? notify.leads.filter((x) => x !== m) : [...notify.leads, m].sort((a, b) => b - a); if (leads.length) change({ notify: { ...notify, leads } }); }}
              >{m} min</button>
            ))}
          </div>
          <label class="bn-switch">
            <span><b>Nur bei Verspätung oder Ausfall</b><small>Aus: auch „pünktlich“ melden</small></span>
            <input type="checkbox" role="switch" checked={notify.onlyDelay} onChange={(e) => change({ notify: { ...notify, onlyDelay: e.currentTarget.checked } })} />
          </label>
          <p class="bn-note">Überwacht wird die erste Fahrt. Die Nachricht kommt auch bei geschlossener App.</p>
          {syncState.value === 'waiting' && <p class="bn-warning" role="status">Noch nicht an den Push-Dienst übertragen. Das wird nachgeholt, sobald er erreichbar ist.</p>}
          <button type="button" class="bn-btn bn-btn-text" onClick={() => void test()}>Test-Nachricht senden</button>
        </>
      )}
      {message && <p class="bn-warning" role="status">{message}</p>}
      <button type="button" class="bn-btn bn-btn-text bn-remove" onClick={() => { pop(); removeTrip(trip.id); }}>Gespeicherte Verbindung entfernen</button>
    </div>
  );
}
