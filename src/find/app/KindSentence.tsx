// The sentence of the first screen, "Findet die nächste Toilette.": the kinds take turns, starting with the chosen one.
// Only the noun rolls, on a line of its own; the words before it change without animation.
import { useEffect, useState } from 'preact/hooks';
import { KINDS } from '../data/kinds';
import { kind } from '../state/finder';

const STEP_MS = 2000;

export function KindSentence() {
  const chosen = KINDS.indexOf(kind.value);
  const [at, setAt] = useState({ now: chosen, before: -1 });

  useEffect(() => {
    setAt({ now: chosen, before: -1 });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setAt(({ now }) => ({ now: (now + 1) % KINDS.length, before: now })), STEP_MS);
    return () => clearInterval(timer);
  }, [chosen]);

  // `next` is always article, adjective, noun: "den nächsten Fahrradständer"
  const words = (i: number) => KINDS[i]!.next.split(' ') as [string, string, string];
  const [article, adjective, noun] = words(at.now);

  // a screen reader hears the chosen kind once, not a new sentence every two seconds
  return (
    <>
      <span class="find-sr">Findet {kind.value.next}.</span>
      <span aria-hidden="true">
        Findet {article} {adjective}
        <span class="find-roll">
          {at.before >= 0 && <span key={at.before} class="find-roll-out">{words(at.before)[2]}.</span>}
          <span key={at.now} class={at.before >= 0 ? 'find-roll-in' : undefined}>{noun}.</span>
        </span>
      </span>
    </>
  );
}
