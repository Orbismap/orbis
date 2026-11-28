import { useEffect, useState } from 'preact/hooks';
import { liftStations, type StationLifts } from '../data/lifts';
import type { Journey } from '../data/types';
import { sources } from '../state/sources';

/**
 * Hinweis auf Aufzüge, die gerade ausfallen. Ohne Meldung bleibt der Platz leer: Das heißt nicht, dass alle
 * Aufzüge fahren, denn nicht jeder Bahnhof ist bekannt.
 */
export function Lifts({ journey, now }: { journey: Journey; now: number }) {
  const names = liftStations(journey, now);
  const key = names.join('|');
  const [found, setFound] = useState<{ key: string; list: { name: string; lifts: StationLifts }[] }>({ key: '', list: [] });

  useEffect(() => {
    if (!key || !sources.lifts) return;
    const ctl = new AbortController();
    const asked = key.split('|');
    void sources.lifts(asked, ctl.signal).then((results) => {
      if (ctl.signal.aborted) return;
      const list = asked.flatMap((name, i) => {
        const lifts = results[i];
        return lifts && (lifts.broken.length || lifts.unknown.length) ? [{ name, lifts }] : [];
      });
      setFound({ key, list });
    });
    return () => ctl.abort();
  }, [key]);

  if (found.key !== key || !found.list.length) return null;
  const broken = found.list.reduce((n, s) => n + s.lifts.broken.length, 0);
  return (
    <details class="bn-lifts">
      <summary>
        {broken ? `${broken} ${broken > 1 ? 'Aufzüge' : 'Aufzug'} außer Betrieb` : 'Aufzüge: Zustand teils unbekannt'}
      </summary>
      {found.list.map((s) => (
        <div key={s.name}>
          <b>{s.name}</b>
          <ul>
            {s.lifts.broken.map((l, i) => <li key={`b${i}`}>{l.text}: außer Betrieb{l.reason ? ` (${l.reason})` : ''}</li>)}
            {s.lifts.unknown.map((l, i) => <li key={`u${i}`}>{l.text}: Zustand unbekannt</li>)}
          </ul>
        </div>
      ))}
      <p>Stand jetzt, nicht zur Reisezeit. Nicht jeder Aufzug liegt auf deinem Weg. Quelle: DB InfraGO, FaSta (CC BY 4.0).</p>
    </details>
  );
}
