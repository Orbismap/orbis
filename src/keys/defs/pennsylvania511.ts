import { defineKey } from '../define';

export default defineKey({
  id: 'pennsylvania511',
  name: '511PA (Pennsylvania)',
  group: 'kameras',
  unlocks: 'Verkehrskameras in Pennsylvania live von 511PA',
  url: 'https://511pa.com',
  steps: ['Kostenloses Konto beim Portal anlegen und anmelden.', 'Im Konto unter „Developers“ einen Entwickler-Schlüssel anfordern.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9_-]{16,}$/.test(v.trim()),
});
