// Trains worldwide. The source follows the region in view: Transitous (MOTIS) timetable and real-time for Europe,
// Digitraffic GPS for Finland, Amtraker GPS for the USA, Entur GPS for Norway, plus the regional rail feeds of the
// local transport sources (SEPTA, MBTA commuter rail …). All feeds share one vehicle model (data/parsers/vehicles).
import { kindLegend, mountVehicles } from '../../data/parsers/vehiclekit';
import { defineLayer } from '../define';

const KINDS = ['fern', 'regio', 'sbahn'] as const;

export default defineLayer({
  id: 'zuege',
  category: 'verkehr',
  title: 'Züge',
  summary: 'Fern-, Regionalzüge und S-Bahnen live, Quelle je nach Region',
  icon: 'train',
  color: '#ff5d4a',
  form: 'tracks',
  cadence: 'live',
  coverage: 'Welt',
  sources: [
    { name: 'Transitous (MOTIS) – Fahrplan mit Echtzeit, Europa', url: 'https://transitous.org/', license: 'Daten der Verkehrsunternehmen, meist offen' },
    { name: 'Fintraffic Digitraffic Rail – Finnland', url: 'https://www.digitraffic.fi/en/railway-traffic/', license: 'CC BY 4.0' },
    { name: 'Amtraker – Amtrak USA', url: 'https://amtraker.com/', license: 'Amtrak-Daten' },
    { name: 'Entur – Norwegen', url: 'https://developer.entur.org/', license: 'NLOD' },
  ],
  options: [
    { id: 'kind', label: 'Zugart', type: 'select', default: 'all', choices: [{ value: 'all', label: 'Alle' }, { value: 'fern', label: 'Fernzug' }, { value: 'regio', label: 'Regionalzug' }, { value: 'sbahn', label: 'S-Bahn' }] },
  ],
  legend: kindLegend([...KINDS, 'andere']),
  keywords: ['zug', 'bahn', 'ice', 'db', 'finnland', 'train', 'rail', 'vr', 'amtrak', 'entur', 'transitous', 's-bahn', 'regionalzug', 'europa'],

  mount: (ctx) => mountVehicles(ctx, { group: 'train', transitousZoom: 5, minZoom: 3, kinds: [...KINDS, 'andere'] }, [0.28, 0.42, 0.62, 0.85]),
});
