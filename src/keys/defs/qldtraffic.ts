import { defineKey } from '../define';

export default defineKey({
  id: 'qldtraffic',
  name: 'QLDTraffic (Queensland)',
  group: 'kameras',
  unlocks: 'Straßenkameras in Queensland live von QLDTraffic',
  url: 'https://qldtraffic.qld.gov.au/more/Developers-and-Data/',
  steps: ['Auf der Entwicklerseite von QLDTraffic den Zugang anfordern.', 'Den API-Schlüssel laut Spezifikation verwenden.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => v.trim().length >= 8,
});
