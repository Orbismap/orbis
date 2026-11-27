// "Kompass kalibrieren": the compass belongs to the device, a web page cannot set it. The device does that itself while it is
// moved in a figure eight; this page says how, and shows live where the compass points, so that one can check.
import { useEffect } from 'preact/hooks';
import { Icon } from '@/ui/icons/Icon';
import { directionName, isPoor } from '../data/attitude';
import { compass, compassAccuracy, findNorthAnew, heading, startCompass } from '../state/sensors';
import { calibrating } from '../state/ui';

const EIGHT = 'M100 50C125 10 180 10 180 50S125 90 100 50S20 10 20 50S75 90 100 50Z';

export function Calibrate() {
  // on iOS the app's own north is looked for again, now and after the movement
  useEffect(() => {
    findNorthAnew();
    return findNorthAnew;
  }, []);
  const on = compass.value === 'on' && heading.value !== null;
  const degrees = on ? ((Math.round(heading.value!) % 360) + 360) % 360 : 0;
  const accuracy = compassAccuracy.value;

  return (
    <div class="find-sheet" role="dialog" aria-modal="true" aria-labelledby="find-cal-title" onKeyDown={(e) => { if (e.key === 'Escape') calibrating.value = false; }}>
      <div class="find-sheet-body">
        <header>
          <h1 id="find-cal-title">Kompass kalibrieren</h1>
          <button type="button" class="find-close" aria-label="Schließen" onClick={() => (calibrating.value = false)}><Icon name="close" size={20} /></button>
        </header>
        <svg class="find-eight" viewBox="0 0 200 100" aria-hidden="true">
          <path id="find-eight-path" d={EIGHT} fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="6 6" opacity="0.6" />
          <rect x="-8" y="-14" width="16" height="28" rx="4" fill="currentColor">
            <animateMotion dur="3s" repeatCount="indefinite">
              <mpath href="#find-eight-path" />
            </animateMotion>
          </rect>
        </svg>
        <ol class="find-steps">
          <li>Geh weg von Metall und Magneten, etwa Auto, Fahrradrahmen oder Magnethülle.</li>
          <li>Bewege das Handy drei- bis sechsmal in einer großen 8 und drehe es dabei.</li>
          <li>Halte es danach flach vor dich.</li>
          <li>Prüfe die Richtung unten, zum Beispiel entlang einer Straße, deren Verlauf du kennst.</li>
        </ol>
        <div class="find-compass">
          <svg viewBox="-36 -36 72 72" aria-hidden="true">
            <circle r="34" fill="none" stroke="var(--ink-3)" stroke-width="2" />
            {on && (
              <g transform={`rotate(${-degrees})`}>
                <path d="M0 -28 7 0H-7Z" fill="var(--limb)" />
                <path d="M0 28 7 0H-7Z" fill="var(--text-3)" />
                <text y="-12" text-anchor="middle" font-size="10" font-weight="700" fill="var(--on-limb)">N</text>
              </g>
            )}
          </svg>
          <div>
            {on ? <b>Du schaust nach {directionName(degrees)} ({degrees}°)</b> : <b>Noch kein Signal vom Kompass</b>}
            {on && accuracy !== null && (
              <p class={isPoor(accuracy) ? 'find-text find-warn' : 'find-text'}>{accuracy < 0 ? 'Genauigkeit unbekannt, weiter bewegen.' : `Mögliche Abweichung: bis ${accuracy}°`}</p>
            )}
          </div>
        </div>
        {compass.value === 'ask' && <button type="button" class="find-button find-quiet" onClick={() => void startCompass()}>Kompass einschalten</button>}
        <p class="find-text">Stimmt die Richtung noch nicht, prüfe in den Einstellungen des Handys, ob die Kompass-Kalibrierung bzw. Standortgenauigkeit eingeschaltet ist, und wiederhole die Bewegung.</p>
        <button type="button" class="find-button" onClick={() => (calibrating.value = false)}>Fertig</button>
      </div>
    </div>
  );
}
