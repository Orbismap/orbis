// Federal and state election results in Germany, per Land, one step per election day on the timeline.
import { DAY } from '../../core/time';
import { DE_DAYS, DE_PARTIES, dayMs, deElections, type DeDoc, type ElKind } from '../../data/parsers/wahlen';
import { electionLayer } from '../../data/parsers/wahlen-layer';
import { defineLayer } from '../define';

const BASE = `${import.meta.env.BASE_URL}data/wahlen/`;

export default defineLayer({
  id: 'wahlen',
  category: 'gesellschaft',
  title: 'Wahlen Deutschland',
  summary: 'Wahlsieger je Bundesland bei Bundestags- und Landtagswahlen, Wahl für Wahl durch die Zeit',
  icon: 'vote',
  color: '#C0A0FF',
  form: 'areas',
  cadence: 'static',
  coverage: 'DE',
  sources: [
    { name: 'GERDA – German Election Database (Heddesheimer, Hilbig, Sichart, Wiedemann 2025), Bundestagswahlen', url: 'https://doi.org/10.7910/DVN/WZTWYH', license: 'CC BY 4.0, auf Länder aggregiert' },
    { name: 'Statistische Ämter des Bundes und der Länder, Regionaldatenbank (Landtagswahlen, via GERDA)', url: 'https://www.regionalstatistik.de/', license: 'dl-de/by-2-0, auf Länder aggregiert' },
    { name: 'BKG, Verwaltungsgebiete VG2500, vereinfacht', url: 'https://gdz.bkg.bund.de/', license: 'dl-de/by-2-0 © GeoBasis-DE / BKG' },
  ],
  time: {
    mode: 'frames',
    range: () => {
      const n = Date.now();
      return { start: dayMs(DE_DAYS[0]!) - n - 30 * DAY, end: 0, step: DAY, frames: DE_DAYS.map((d) => dayMs(d) - n) };
    },
  },
  options: [{ id: 'wahl', label: 'Wahl', type: 'select', default: 'all', choices: [{ value: 'all', label: 'Bundestag und Landtag (jeweils letzte)' }, { value: 'btw', label: 'Bundestagswahl' }, { value: 'ltw', label: 'Landtagswahl' }] }],
  legend: { type: 'classes', items: DE_PARTIES.map((p) => ({ color: p.color, label: p.label, shape: 'square' as const })) },
  keywords: ['wahl', 'bundestag', 'landtag', 'wahlergebnis', 'afd', 'cdu', 'spd', 'grüne', 'btw', 'ltw'],

  mount: (ctx) => electionLayer<DeDoc>(ctx, {
    key: 'de', docUrl: `${BASE}de.json`, geoUrl: `${BASE}de-geo.json`, elections: deElections, regions: (d) => d.regions, parties: DE_PARTIES, icon: 'vote',
    kinds: (o): ElKind[] => (o.wahl === 'btw' ? ['btw'] : o.wahl === 'ltw' ? ['ltw'] : ['btw', 'ltw']),
    sources: [{ label: 'GERDA (CC BY 4.0)', url: 'https://doi.org/10.7910/DVN/WZTWYH' }, { label: 'Regionaldatenbank (dl-de/by-2-0)', url: 'https://www.regionalstatistik.de/' }],
  }),
});
