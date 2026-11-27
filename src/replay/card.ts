// The details page of an event as an inspector card: key facts, the vertical timeline (a step starts the replay from there),
// the footage and the sources. Pure: what happens on a click is handed in.
import type { InspectCard } from '../layers/types';
import { tLabel } from './director';
import type { ReplayEvent } from './types';

export const EVENT_COLOR = '#f2b45a';

export function eventCard(ev: ReplayEvent, play: (at?: number) => void): InspectCard {
  return {
    title: ev.title,
    subtitle: ev.subtitle,
    time: ev.t0,
    color: EVENT_COLOR,
    icon: 'rocket',
    facts: ev.facts,
    text: `${ev.summary}\n\n${ev.note}`,
    timeline: ev.phases.map((p) => ({ at: tLabel(p.from), title: p.label, text: p.info, run: () => play(p.from) })),
    links: [
      ...ev.links.map((l) => ({ label: `${l.label}${l.kind === 'official' ? ' (offiziell)' : ''}`, url: l.url })),
      ...ev.sources.map((s) => ({ label: `Quelle: ${s.name}`, url: s.url })),
    ],
    location: ev.pad,
    actions: [{ id: 'play', label: 'Wiederholung starten', icon: 'play', primary: true, run: () => play() }],
  };
}
