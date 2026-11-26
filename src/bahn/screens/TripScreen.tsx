import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { LineBadge } from '../ui/Badges';
import { ErrorState, Header, Skeleton } from '../ui/parts';
import { Screen } from '../ui/Sheet';
import { useScene } from '../ui/scene';
import { tripMap } from '../ui/mapData';
import { cssModeColor } from '../ui/mapLayers';
import { plannedJourney } from '../data';
import { journeyOf } from '../data/transitous';
import type { Leg } from '../data/types';
import { sources } from '../state/sources';
import type { Screen as NavScreen } from '../state/nav';
import { useAsync } from '../state/hooks';
import { CallRow } from './JourneyDetail';

type Props = Extract<NavScreen, { kind: 'trip' }>;

/** Linienlauf einer Fahrt: alle Halte mit Zeiten, auf der Karte der Verlauf mit antippbaren Halten. */
export function TripScreen({ tripId, line, mode, headsign, at }: Props) {
  const trip = useAsync((signal) => sources.transit.trip(tripId, signal), [tripId]);
  const [leg, setLeg] = useState<Leg>();

  // erst der Fahrplan, dann die DB-Echtzeit (wie bei den Verbindungen)
  useEffect(() => {
    const raw = trip.data;
    if (!raw) return;
    if (!sources.delays) {
      setLeg(raw);
      return;
    }
    const ctl = new AbortController();
    const journey = journeyOf([raw], 0);
    setLeg(plannedJourney(journey).legs[0]);
    sources.delays.journeys([journey], ctl.signal).then((merged) => !ctl.signal.aborted && setLeg(merged[0]?.legs[0]), () => undefined);
    return () => ctl.abort();
  }, [trip.data]);

  const map = useMemo(() => (leg ? tripMap(leg, cssModeColor, at) : undefined), [leg, at]);
  useScene({ ...map, onRoute: () => undefined });

  // die Haltestelle, von der man kommt, in den Blick holen
  const here = useRef<HTMLLIElement>(null);
  useEffect(() => { here.current?.scrollIntoView({ block: 'start' }); }, [!!leg]);

  const calls = leg ? [leg.from, ...leg.via, leg.to] : [];

  return (
    <Screen
      label={`Linie ${line}`}
      head={<Header title={<LineBadge mode={mode} line={line} />} subtitle={headsign ? `Richtung ${headsign}` : leg?.agency} />}
    >
      {trip.loading && !leg && <Skeleton rows={7} />}
      {trip.error && <ErrorState message={trip.error} onRetry={trip.reload} />}
      {leg?.cancelled && <p class="bn-warning bn-late">Diese Fahrt fällt ganz oder teilweise aus.</p>}
      {leg && (
        <ol class="bn-calls bn-calls-trip" style={{ '--c': `var(--m-${leg.mode})` }}>
          {calls.map((c, i) => {
            const current = !!at && c.stopId === at;
            return (
              <li key={i} class={current ? 'bn-here' : ''} ref={current ? here : undefined}>
                <CallRow call={c} mode={leg.mode} strong={current || i === 0 || i === calls.length - 1} />
              </li>
            );
          })}
        </ol>
      )}
    </Screen>
  );
}
