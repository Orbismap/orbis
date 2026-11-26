import { useEffect, useState } from 'preact/hooks';
import { describeError } from '@/data/http';
import type { Departure, Stop } from '../data/types';
import { plannedDepartures } from '../data';
import { sources } from './sources';

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

/** Abfahrten einer Haltestelle: zuerst Fahrplan (Züge ohne unsichere Verspätung), dann DB-Echtzeit, alle 30 s neu. */
export function useDepartures(stop: Stop | null, n = 30): { list: Departure[]; loading: boolean; error?: string; updated?: number } {
  const [state, setState] = useState<{ list: Departure[]; loading: boolean; error?: string; updated?: number }>({ list: [], loading: !!stop });
  useEffect(() => {
    if (!stop) {
      setState({ list: [], loading: false });
      return;
    }
    let alive = true;
    const ctl = new AbortController();
    setState({ list: [], loading: true });
    const run = async () => {
      try {
        const base = await sources.transit.departures(stop, { n }, ctl.signal);
        if (!alive) return;
        setState({ list: sources.delays ? plannedDepartures(base) : base, loading: false, updated: Date.now() });
        if (!sources.delays) return;
        const merged = await sources.delays.departures(stop, base, ctl.signal);
        if (alive) setState((s) => ({ ...s, list: merged }));
      } catch (e) {
        if (alive && !ctl.signal.aborted) setState((s) => ({ ...s, loading: false, error: describeError(e) }));
      }
    };
    void run();
    const id = setInterval(() => !document.hidden && void run(), 30_000);
    return () => {
      alive = false;
      ctl.abort();
      clearInterval(id);
    };
  }, [stop?.id, n]);
  return state;
}
