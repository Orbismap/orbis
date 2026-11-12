import { defineKey } from '../define';

export default defineKey({
  id: 'arizona511',
  name: 'AZ511 (Arizona)',
  group: 'kameras',
  unlocks: 'Verkehrskameras in Arizona live von AZ511',
  url: 'https://az511.com',
  steps: ['Kostenloses Konto beim Portal anlegen und anmelden.', 'Im Konto unter „Developers“ einen Entwickler-Schlüssel anfordern.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9_-]{16,}$/.test(v.trim()),
});
