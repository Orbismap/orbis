// US presidential election results per state, 1976-2024, one step per election on the timeline.
import { DAY } from '../../core/time';
import { US_DAYS, US_PARTIES, dayMs, usElections, type UsDoc } from '../../data/parsers/wahlen';
import { electionLayer } from '../../data/parsers/wahlen-layer';
import { defineLayer } from '../define';

const BASE = `${import.meta.env.BASE_URL}data/wahlen/`;

export default defineLayer({
  id: 'wahlen-usa',
  category: 'gesellschaft',
  title: 'Wahlen USA',
  summary: 'Sieger der Präsidentschaftswahl je Bundesstaat, 1976 bis 2024',
  icon: 'vote',
  color: '#E0524B',
  form: 'areas',
  cadence: 'static',
  coverage: 'USA',
  sources: [
    { name: 'MIT Election Data and Science Lab, U.S. President 1976–2020 (ergänzt bis 2024)', url: 'https://doi.org/10.7910/DVN/42MVDX', license: 'CC0 1.0' },
    { name: 'US Census Bureau, Cartographic Boundary Files 2022 (1:20 Mio.), vereinfacht', url: 'https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html', license: 'Public Domain' },
  ],
  time: {
    mode: 'frames',
    range: () => {
      const n = Date.now();
      return { start: dayMs(US_DAYS[0]!) - n - 90 * DAY, end: 0, step: DAY, frames: US_DAYS.map((d) => dayMs(d) - n) };
    },
  },
  legend: { type: 'classes', items: US_PARTIES.filter((p) => p.id !== 'OTHER').map((p) => ({ color: p.color, label: p.label, shape: 'square' as const })) },
  keywords: ['wahl', 'präsident', 'usa', 'president', 'trump', 'biden', 'harris', 'election', 'republikaner', 'demokraten'],

  mount: (ctx) => electionLayer<UsDoc>(ctx, {
    key: 'us', docUrl: `${BASE}us.json`, geoUrl: `${BASE}us-geo.json`, elections: usElections, regions: (d) => d.regions, parties: US_PARTIES, icon: 'vote',
    kinds: () => ['pres'],
    sources: [{ label: 'MIT Election Lab (CC0)', url: 'https://doi.org/10.7910/DVN/42MVDX' }, { label: 'US Census Bureau (Public Domain)', url: 'https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html' }],
  }),
});
