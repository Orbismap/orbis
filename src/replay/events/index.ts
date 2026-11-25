// The events that can be replayed. The data of an event is only loaded when it is opened; what the list needs (title, cover) is here, so the list shows at once.
import type { LngLat } from '../../core/geo';
import type { ReplayEvent } from '../types';
import starship15Cover from './covers/starship-flight-15.webp';

export interface ReplayListing {
  id: string;
  title: string;
  subtitle: string;
  /** when T-0 was, ms since epoch */
  t0: number;
  /** where it happened (the map marker) */
  pad: LngLat;
  /** cover photo */
  cover: string;
  /** short facts for the list chips, e.g. the length and the outcome */
  badges: string[];
  load(): Promise<ReplayEvent>;
}

export const REPLAY_EVENTS: readonly ReplayListing[] = [
  {
    id: 'starship-flight-15',
    title: 'Starship Flug 15',
    subtitle: 'Orbit, 26 Starlink V3 und der erste Schiffsfang',
    t0: Date.UTC(2026, 10, 13, 22, 47, 0),
    pad: [-97.1541, 25.9961],
    cover: starship15Cover,
    badges: ['22 h 33 min', 'Ship gefangen'],
    load: async () => (await import('./starship15')).starship15,
  },
];

export const findReplay = (id: string) => REPLAY_EVENTS.find((e) => e.id === id);
