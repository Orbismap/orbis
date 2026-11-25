// Live replays: past events (rocket launches, re-entries) that can be watched again as a 3D animation. Each event sits at its
// place on the map; its card is the details page: key facts, a vertical timeline (a step starts the replay from there),
// the footage and the sources. The animation itself is the replay mode (state/replay, drawn by Orbis Pro).
import { computed } from '@preact/signals';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { EVENT_COLOR as COLOR, eventCard } from '../../replay/card';
import { REPLAY_EVENTS } from '../../replay/events';
import { playReplay } from '../../state/replay';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'wiederholungen',
  category: 'verkehr',
  title: 'Live-Wiederholungen',
  summary: 'Vergangene Ereignisse wie Raketenstarts als 3D-Animation noch einmal erleben',
  icon: 'rocket',
  color: COLOR,
  form: 'points',
  cadence: 'static',
  sources: [
    { name: 'Space.com', url: 'https://www.space.com/', license: 'Fakten, Quellenangabe' },
    { name: 'Space Launch Schedule', url: 'https://www.spacelaunchschedule.com/', license: 'Fakten, Quellenangabe' },
    { name: 'NASASpaceFlight', url: 'https://www.nasaspaceflight.com/', license: 'Fakten, Quellenangabe' },
  ],
  keywords: ['wiederholung', 'replay', 'rewatch', 'starship', 'spacex', 'rakete', 'start', 'raumfahrt', 'animation', '3d', 'flug 15', 'starlink'],

  async mount(ctx) {
    const events = await Promise.all(REPLAY_EVENTS.map((l) => l.load()));
    const byId = new Map(events.map((e) => [e.id, e]));
    const cardFor = (id: string) => {
      const ev = byId.get(id);
      return ev ? eventCard(ev, (at) => playReplay(id, at)) : { title: 'Ereignis', facts: [] };
    };
    const fc = computed<FeatureCollection<Point>>(() => ({
      type: 'FeatureCollection',
      features: events.map((e): Feature<Point> => ({ type: 'Feature', geometry: { type: 'Point', coordinates: e.pad }, properties: { id: e.id, t0: e.t0 } })),
    }));
    const point = pointLayer(ctx, {
      data: fc,
      radius: 10,
      color: COLOR,
      symbol: { icon: 'rocket', size: 0.75 },
      stroke: { color: 'rgba(10, 15, 24, 0.9)', width: 1.5 },
      describe: (f: AnyFeature) => cardFor(String(f.properties.id)),
      feed: () => [...events].sort((a, b) => b.t0 - a.t0).map((e) => ({ id: e.id, title: e.title, subtitle: e.subtitle, time: e.t0, color: COLOR, location: e.pad, card: cardFor(e.id) })),
      count: computed(() => events.length),
    });
    return point;
  },
});
