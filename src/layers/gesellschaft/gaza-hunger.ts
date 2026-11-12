// Food insecurity in the Gaza Strip by governorate (IPC acute food insecurity phases).
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatInt, formatPercent } from '../../core/format';
import { bucketUrl } from '../../data/endpoints';
import type { IpcCollection, IpcPeriod, IpcProps } from '../../data/parsers/gaza';
import { ZEUGEN_WARNUNG } from '../../data/parsers/zeitzeugen';
import { areaLayer } from '../../render/areas';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const PHASE = ['#CDFACD', '#FAE61E', '#E67800', '#C80000', '#640000'];
const NAME = ['Minimal', 'Angespannt', 'Krise', 'Notlage', 'Katastrophe / Hungersnot'];

export default defineLayer({
  id: 'gaza-hunger',
  category: 'gesellschaft',
  title: 'Gaza: Ernährungslage',
  summary: 'IPC-Phase der Ernährungssicherheit je Gouvernement im Gazastreifen',
  icon: 'warning',
  color: '#E67800',
  form: 'areas',
  cadence: 'daily',
  coverage: 'Gazastreifen',
  sources: [{ name: 'IPC, Integrated Food Security Phase Classification, über HDX', url: 'https://data.humdata.org/dataset/state-of-palestine-acute-food-insecurity-country-data', license: 'CC0', manifest: { bucket: 'data', key: 'ipc-gaza.json' } }],
  sensitive: ZEUGEN_WARNUNG,
  legend: { type: 'classes', items: PHASE.map((color, i) => ({ color, label: `Phase ${i + 1}: ${NAME[i]}`, shape: 'square' as const })) },
  keywords: ['gaza', 'hunger', 'ipc', 'ernährung', 'hungersnot', 'zeitzeugen', 'nahrung'],

  mount(ctx) {
    const raw = ctx.resource<IpcCollection>({ key: 'data:ipc-gaza', url: bucketUrl('data', 'ipc-gaza.json'), parse: 'ipcAreas', timeout: 30_000 });
    return areaLayer(ctx, {
      data: raw,
      idKey: 'id',
      fill: ['match', ['get', 'phase'], 1, PHASE[0], 2, PHASE[1], 3, PHASE[2], 4, PHASE[3], 5, PHASE[4], '#888888'] as unknown as ExpressionSpecification,
      fillOpacity: 0.7,
      outline: { color: 'rgba(20,20,20,0.9)', width: 1.2 },
      describe: (f: AnyFeature) => {
        const p = f.properties as IpcProps;
        const shares = JSON.parse(p.shares) as number[];
        const people = JSON.parse(p.people) as number[];
        const hist = JSON.parse(p.history) as IpcPeriod[];
        return {
          title: p.name,
          subtitle: `Phase ${p.phase}: ${NAME[p.phase - 1] ?? 'unbekannt'}`,
          color: PHASE[Math.max(0, p.phase - 1)],
          icon: 'warning',
          facts: [
            { label: 'Bevölkerung', value: formatInt(p.pop) },
            ...shares.map((s, i) => ({ label: `Phase ${i + 1}: ${NAME[i]}`, value: `${formatPercent(s)} (${formatInt(people[i] ?? 0)})` })),
            ...hist.slice(-4).map((h) => ({ label: `Analyse ${h.analysis} (${h.from} bis ${h.to})`, value: `Phase 3 oder höher: ${formatPercent(h.p['3+'] ?? 0)}, Phase 5: ${formatPercent(h.p['5'] ?? 0)}` })),
          ],
          links: [{ label: 'IPC Gaza-Analysen', url: 'https://www.ipcinfo.org/ipc-country-analysis/details-map/en/c/1156433/' }, { label: 'HDX-Datensatz (CC0)', url: 'https://data.humdata.org/dataset/state-of-palestine-acute-food-insecurity-country-data' }],
        };
      },
    });
  },
});
