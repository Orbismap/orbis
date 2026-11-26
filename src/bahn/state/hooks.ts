import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { online } from '@/core/online';
import { describeError } from '@/data/http';
import type { Departure, Stop } from '../data/types';
import { plannedDepartures } from '../data';
import { saveDepartures, savedDepartures } from '../data/offline';
import { sources } from './sources';
import { ActiveScreen } from '../ui/scene';

/** Aktuelle Zeit, alle `ms` neu (für "in 5 min"). */
export function useNow(ms = 20_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export interface Async<T> { data: T | undefined; loading: boolean; error: string | undefined; reload: () => void }

/** Lädt, sobald sich `deps` ändern; bricht überholte Anfragen ab. */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<{ data?: T; loading: boolean; error?: string }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ctl = new AbortController();
    setState((s) => ({ data: s.data, loading: true }));
    load(ctl.signal).then(
      (data) => !ctl.signal.aborted && setState({ data, loading: false }),
      (e: unknown) => !ctl.signal.aborted && setState({ loading: false, error: describeError(e) }),
    );
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data: state.data, loading: state.loading, error: state.error, reload: () => setTick((t) => t + 1) };
}

export interface Departures {
  list: Departure[];
  loading: boolean;
  error?: string;
  /** Wann die gezeigte Liste ankam. */
  updated?: number;
  /** Die Liste ist die gespeicherte: (noch) keine neue Antwort. */
  saved?: boolean;
}

/**
 * Abfahrten einer Haltestelle: sofort die zuletzt gespeicherten, dann der Fahrplan (Züge ohne unsichere Verspätung), dann die
 * DB-Echtzeit, alle 30 s neu (nur auf der sichtbaren Seite). Ohne Netz bleiben die gespeicherten stehen, abgefahrene
 * fallen heraus.
 */
export function useDepartures(stop: Stop | null, n = 30): Departures {
  const [state, setState] = useState<Departures>({ list: [], loading: !!stop });
  const net = online.value;
  // verdeckte Seiten bleiben bestehen, fragen aber nicht weiter ab
  const active = useRef(true);
  active.current = useContext(ActiveScreen);
  useEffect(() => {
    if (!stop) {
      setState({ list: [], loading: false });
      return;
    }
    let alive = true;
    const ctl = new AbortController();
    const kept = (): Departures | undefined => {
      const k = savedDepartures(stop);
      return k && { list: k.data.slice(0, n), updated: k.at, saved: true, loading: false };
    };
    setState({ list: [], ...kept(), loading: true });
    const show = (list: Departure[]) => {
      setState({ list, loading: false, updated: Date.now() });
      saveDepartures(stop, list);
    };
    const run = async () => {
      try {
        const base = await sources.transit.departures(stop, { n }, ctl.signal);
        if (!alive) return;
        const planned = sources.delays ? plannedDepartures(base) : base;
        show(planned);
        if (!sources.delays) return;
        const merged = await sources.delays.departures(stop, base, ctl.signal);
        if (alive) show(merged);
      } catch (e) {
        if (alive && !ctl.signal.aborted) setState((s) => ({ ...s, ...kept(), loading: false, error: describeError(e) }));
      }
    };
    void run();
    const id = setInterval(() => !document.hidden && active.current && void run(), 30_000);
    return () => {
      alive = false;
      ctl.abort();
      clearInterval(id);
    };
  }, [stop?.id, n, net]);
  return state;
}
